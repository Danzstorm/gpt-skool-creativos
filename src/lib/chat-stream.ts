import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Streamea un run del asistente sobre un thread como SSE.
 * onComplete se ejecuta cuando el run termina OK (p.ej. actualizar updated_at/title).
 */
export function runStreamResponse(
  openaiThreadId: string,
  assistantId: string,
  onComplete?: () => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const run = openai.beta.threads.runs.stream(openaiThreadId, {
          assistant_id: assistantId,
        });

        for await (const event of run) {
          if (event.event === "thread.message.delta" && event.data.delta.content) {
            for (const block of event.data.delta.content) {
              if (block.type === "text" && block.text?.value) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: block.text.value })}\n\n`)
                );
              }
            }
          }

          if (event.event === "thread.run.completed") {
            if (onComplete) await onComplete();
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          if (event.event === "thread.run.failed") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: "Error en el asistente" })}\n\n`)
            );
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Error interno" })}\n\n`));
      } finally {
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
