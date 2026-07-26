import OpenAI from "openai";
import type { ResponseInputItem, Tool } from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Streamea una Response de OpenAI (Responses API) sobre una Conversation como SSE.
 * onAssistantText recibe el texto final completo (para persistirlo en `messages`).
 * onComplete se ejecuta cuando la respuesta termina OK (p.ej. actualizar updated_at/title).
 */
export interface RunMeta {
  model: string | null;
  tokensIn: number;
  tokensOut: number;
}

export interface RunStreamParams {
  conversationId: string;
  model: string;
  instructions: string;
  // La Responses API exige `input` en cada llamada; no hay forma de "continuar
  // sin aportar nada nuevo" (confirmado: omitirlo da 400 missing_required_parameter).
  input: ResponseInputItem[];
  tools?: Tool[];
  onAssistantText?: (text: string) => Promise<void> | void;
  onComplete?: (meta: RunMeta) => Promise<void>;
  // Se ejecuta siempre al final (éxito o error) — para liberar el lock del thread.
  onSettled?: () => Promise<void>;
  // AbortSignal de la request entrante (route.ts la recibe como segundo
  // argumento del handler). Se reenvía a la llamada a OpenAI para que, cuando
  // el usuario pulsa "Detener" y el cliente cierra la conexión, la petición a
  // OpenAI se cancele de verdad y el `for await` caiga al catch — de ahí sale
  // la oportunidad de persistir el texto generado hasta ese punto. Sin esto,
  // el servidor seguía generando (y pagando) tokens después de que el cliente
  // se había ido, y lo ya generado no quedaba guardado en ningún lado.
  signal?: AbortSignal;
}

// Los modelos gpt-5 son de razonamiento: sin `reasoning.effort` explícito usan
// "medium" y queman miles de tokens de reasoning (facturados como output) antes
// de responder. Medido contra un system prompt real de la plataforma:
//   gpt-5.4-nano  default → 37.5s (5120 tokens de reasoning)
//   gpt-5.4-nano  sin reasoning →  3.8s
// Estos GPTs generan prompts a partir de instrucciones ya muy detalladas: no
// necesitan cadena de razonamiento.
//
// El nombre del nivel cambió entre familias (verificado contra la API):
//   gpt-5 / -mini / -nano  → aceptan "minimal", rechazan "none"
//   gpt-5.1 en adelante    → aceptan "none", rechazan "minimal"
// Mandar el valor equivocado es un 400, así que se elige por familia.
// Los modelos no-razonadores (gpt-4.1-*) no aceptan `reasoning` en absoluto.
function reasoningFor(model: string) {
  if (/^gpt-5(-|$)/.test(model)) return { reasoning: { effort: "minimal" as const } };
  if (/^gpt-5\.\d/.test(model)) return { reasoning: { effort: "none" as const } };
  return {};
}

function generationErrorMessage(error: unknown, aborted: boolean | undefined): string {
  if (aborted) {
    return "⚠️ La respuesta se interrumpió (tiempo de espera agotado o cancelada). Vuelve a intentarlo.";
  }
  const raw = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    raw.includes("expected image type") ||
    raw.includes("unsupported image") ||
    raw.includes("invalid image")
  ) {
    return "⚠️ OpenAI no pudo leer una de las imágenes. Prueba a subirla de nuevo en formato JPG, PNG o WebP.";
  }
  return "⚠️ Error al generar la respuesta. Vuelve a intentarlo.";
}

function safeErrorDetails(error: unknown) {
  const value = error as {
    name?: string;
    message?: string;
    status?: number;
    code?: string | null;
    requestID?: string;
  };
  return {
    name: value?.name,
    message: value?.message ?? String(error),
    status: value?.status,
    code: value?.code,
    requestId: value?.requestID,
  };
}

export function runStreamResponse(params: RunStreamParams): Response {
  const { conversationId, model, instructions, input, tools, onAssistantText, onComplete, onSettled, signal } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Se acumula fuera del try para que el catch de abajo también pueda
      // persistir lo generado hasta el momento del fallo, no solo el camino feliz.
      let fullText = "";
      // Marca si ya se guardó ALGO para este turno (texto real o aviso de error).
      // Sin esto, un fallo antes del primer token (p.ej. Vercel mata la función
      // por timeout en turnos con varias imágenes) dejaba el turno del usuario
      // sin ninguna fila de asistente: se perdía en silencio, sin rastro para el
      // usuario ni para el admin. persistOnce garantiza exactamente una escritura.
      let persisted = false;
      const persistOnce = async (text: string) => {
        if (persisted || !onAssistantText) return;
        try {
          await onAssistantText(text);
          persisted = true;
        } catch (error) {
          console.error("runStreamResponse persistence error", {
            conversationId,
            model,
            ...safeErrorDetails(error),
          });
        }
      };
      const emitTerminalWarning = async (warning: string) => {
        if (fullText) {
          const suffix = `\n\n_(${warning})_`;
          fullText += suffix;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: suffix })}\n\n`));
        } else {
          fullText = warning;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: warning })}\n\n`));
        }
        await persistOnce(fullText);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      };
      try {
        const events = await openai.responses.create(
          {
            model,
            instructions,
            conversation: conversationId,
            input,
            ...(tools && tools.length > 0 ? { tools } : {}),
            ...reasoningFor(model),
            stream: true,
          },
          { signal }
        );

        // `event.response.output_text` en el evento crudo del stream NO viene poblado
        // (es un getter que el SDK solo agrega al valor de retorno no-streaming de
        // `create()`; en el stream crudo el texto vino vacío). Se acumula a mano.
        for await (const event of events) {
          if (event.type === "response.output_text.delta") {
            fullText += event.delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta })}\n\n`)
            );
          }

          // Un rechazo del modelo (p.ej. imagen con una persona real que la
          // moderación no deja describir) no sale por output_text.delta sino
          // por su propio canal de eventos. Sin esto, fullText quedaba vacío
          // y el turno se veía como si el modelo no hubiera dicho nada.
          if (event.type === "response.refusal.delta") {
            fullText += event.delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta })}\n\n`)
            );
          }

          if (event.type === "response.completed") {
            const usage = event.response.usage;
            const meta: RunMeta = {
              model: event.response.model ?? null,
              tokensIn: usage?.input_tokens ?? 0,
              tokensOut: usage?.output_tokens ?? 0,
            };
            await persistOnce(fullText);
            if (onComplete) await onComplete(meta);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          // GAP encontrado 2026-07-24: una Response puede terminar "incompleta"
          // (status ni completed ni failed) por dos motivos reales:
          // incomplete_details.reason = "content_filter" (moderación bloqueó la
          // salida — el caso típico es analizar la foto de una persona real) o
          // "max_output_tokens" (se cortó por longitud). Antes de este fix NINGÚN
          // handler cubría este evento: el for-await lo consumía en silencio, el
          // stream terminaba, `persisted` seguía en false, y el turno del usuario
          // quedaba sin ninguna fila de asistente — ni siquiera el aviso ⚠️ (a
          // diferencia de response.failed, que sí tenía red de seguridad). Así
          // fallaron "Characters" y "CinePrompt" el 2026-07-24: threads nuevos,
          // 1 imagen, nada de espera — no tenía nada que ver con el timeout de
          // Vercel (ese bug ya estaba resuelto), era este evento sin cubrir.
          if (event.type === "response.incomplete") {
            const usage = event.response.usage;
            const meta: RunMeta = {
              model: event.response.model ?? null,
              tokensIn: usage?.input_tokens ?? 0,
              tokensOut: usage?.output_tokens ?? 0,
            };
            const reason = event.response.incomplete_details?.reason;
            const note =
              reason === "content_filter"
                ? "El filtro de contenido de OpenAI bloqueó la respuesta (puede deberse a la imagen enviada). Prueba con otra imagen o reformula el pedido."
                : reason === "max_output_tokens"
                  ? "La respuesta se cortó por exceder el límite de longitud."
                  : "La respuesta quedó incompleta.";
            if (fullText) {
              const suffix = `\n\n_(⚠️ ${note})_`;
              fullText += suffix;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: suffix })}\n\n`));
            } else {
              fullText = `⚠️ ${note}`;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fullText })}\n\n`));
            }
            await persistOnce(fullText);
            if (onComplete) await onComplete(meta);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          if (event.type === "response.failed") {
            // Se persiste lo generado hasta acá antes de avisar del error: la
            // Responses API puede fallar (por ejemplo, un filtro de contenido)
            // después de haber emitido varios deltas de texto, y ese texto ya
            // se le mostró al usuario y ya se pagó — perderlo del historial no
            // tiene sentido solo porque el turno no cerró "limpio". Si no alcanzó
            // a emitir texto, se guarda igual un aviso para que el turno no quede
            // en blanco (visible al usuario, detectable por el admin).
            await emitTerminalWarning("⚠️ El asistente no pudo completar la respuesta. Vuelve a intentarlo.");
          }

          // Evento de error a nivel del stream (distinto de response.failed):
          // lo manda el SDK para fallos como rate_limit_exceeded o server_error
          // ocurridos a mitad de generación. Mismo gap que response.incomplete
          // — sin este handler el turno se perdía sin dejar rastro.
          if (event.type === "error") {
            await emitTerminalWarning(
              `⚠️ Error de OpenAI (${event.code ?? "desconocido"}). Vuelve a intentarlo.`
            );
          }
        }
      } catch (err) {
        // Mismo criterio que arriba: si el catch llegó porque el cliente
        // abortó (pulsó "Detener", `signal` ya cancelado), porque Vercel mató
        // la función por timeout, o por un fallo de red a mitad de generación,
        // lo que ya se alcanzó a generar se guarda igual. Y si no se generó
        // nada, se guarda un aviso para que el turno del usuario no quede sin
        // respuesta y sin rastro (antes se perdía en silencio).
        await emitTerminalWarning(generationErrorMessage(err, signal?.aborted));
        console.error("runStreamResponse error", {
          conversationId,
          model,
          ...safeErrorDetails(err),
        });
      } finally {
        if (onSettled) await onSettled();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
