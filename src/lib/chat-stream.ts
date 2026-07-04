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
}

export function runStreamResponse(params: RunStreamParams): Response {
  const { conversationId, model, instructions, input, tools, onAssistantText, onComplete, onSettled } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const events = await openai.responses.create({
          model,
          instructions,
          conversation: conversationId,
          input,
          ...(tools && tools.length > 0 ? { tools } : {}),
          stream: true,
        });

        // `event.response.output_text` en el evento crudo del stream NO viene poblado
        // (es un getter que el SDK solo agrega al valor de retorno no-streaming de
        // `create()`; en el stream crudo el texto vino vacío). Se acumula a mano.
        let fullText = "";

        for await (const event of events) {
          if (event.type === "response.output_text.delta") {
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
            if (onAssistantText) await onAssistantText(fullText);
            if (onComplete) await onComplete(meta);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          if (event.type === "response.failed") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: "Error en el asistente" })}\n\n`)
            );
          }
        }
      } catch (err) {
        console.error("runStreamResponse error:", err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Error interno" })}\n\n`));
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
