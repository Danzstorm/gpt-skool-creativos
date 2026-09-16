// Lee el body SSE de una respuesta de /api/chat, /api/chat/regenerate o
// /api/admin/gpts/[id]/test-chat y llama onToken por cada fragmento de texto.
// Compartido entre UnifiedChat (chat real) y AdminGptTestModal (chat efímero).
//
// El servidor (src/lib/chat-stream.ts) manda cada evento como `data: {...}\n\n`
// — el `\n\n` es el separador de frame. Antes se decodificaba chunk por chunk y
// se splitteaba por `\n` sin acumular nada entre lecturas: un frame partido
// entre dos paquetes TCP (habitual en redes móviles con respuestas largas)
// dejaba un JSON incompleto y `JSON.parse` lanzaba, truncando el stream a
// mitad de respuesta. Ahora se bufferiza el resto de cada lectura y solo se
// procesan frames completos.
//
// `decoder.decode(value)` sin `{ stream: true }` además corrompía cualquier
// carácter UTF-8 multibyte partido entre chunks — tildes y eñes, en una
// plataforma en español.
//
// El servidor también manda `data: {"error": "..."}` cuando la respuesta de
// OpenAI falla (chat-stream.ts:94,100). Antes ese frame se ignoraba en
// silencio y el stream terminaba como si nada hubiera pasado; acá se convierte
// en una excepción para que el catch del llamador (que ya existe en
// UnifiedChat.tsx y GptTestModal.tsx) lo traduzca a un mensaje visible.
export interface ConsumeSSEOptions {
  /** Se llama una sola vez al recibir [DONE]; el stream puede seguir con frames extra. */
  onDone?: () => void;
  /** Título generado en background tras [DONE] (sidebar). */
  onThreadTitle?: (title: string) => void;
}

export async function consumeSSE(
  res: Response,
  onToken: (text: string) => void,
  // Opcional a propósito: GptTestModal no muestra indicador de espera y no lo
  // pasa, así que el llamador que no lo necesita no cambia ni una línea.
  onPhase?: (phase: string) => void,
  options?: ConsumeSSEOptions
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneNotified = false;

  function processFrame(frame: string) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) return;
    const data = line.slice("data: ".length);
    if (data === "[DONE]") {
      if (!doneNotified) {
        doneNotified = true;
        options?.onDone?.();
      }
      return;
    }

    let parsed: { text?: string; error?: string; phase?: string; thread_title?: string };
    try {
      parsed = JSON.parse(data);
    } catch {
      // Frame corrupto aislado: se descarta en vez de tumbar el stream entero.
      return;
    }
    if (parsed.error) throw new Error(parsed.error);
    // Antes que el texto: un frame trae una cosa o la otra, nunca las dos.
    if (parsed.phase) onPhase?.(parsed.phase);
    if (parsed.text) onToken(parsed.text);
    if (typeof parsed.thread_title === "string" && parsed.thread_title.trim()) {
      options?.onThreadTitle?.(parsed.thread_title.trim());
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? ""; // el último elemento puede estar incompleto
    for (const frame of frames) processFrame(frame);
  }

  buffer += decoder.decode(); // vacía cualquier byte multibyte pendiente
  if (buffer.trim()) processFrame(buffer);
}
