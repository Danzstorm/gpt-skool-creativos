import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { gptId, threadId, message, fileIds } = await request.json();

  if (!gptId || !message) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Fetch assistant_id con service role (nunca expuesto al cliente)
  const { data: gpt, error: gptError } = await serviceClient
    .from("gpts")
    .select("openai_assistant_id, tools_enabled, vision_enabled")
    .eq("id", gptId)
    .eq("is_active", true)
    .single();

  if (gptError || !gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  // Obtener o crear thread
  let openaiThreadId = threadId;

  if (!openaiThreadId) {
    const { data: existingThread } = await supabase
      .from("threads")
      .select("openai_thread_id")
      .eq("user_id", user.id)
      .eq("gpt_id", gptId)
      .single();

    if (existingThread) {
      openaiThreadId = existingThread.openai_thread_id;
    } else {
      const newThread = await openai.beta.threads.create();
      openaiThreadId = newThread.id;

      await supabase.from("threads").insert({
        user_id: user.id,
        gpt_id: gptId,
        openai_thread_id: openaiThreadId,
      });
    }
  }

  // Construir contenido del mensaje (texto + archivos opcionales)
  type MessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_file"; image_file: { file_id: string } };

  const contentParts: MessageContentPart[] = [{ type: "text", text: message }];

  if (fileIds && fileIds.length > 0) {
    for (const fid of fileIds) {
      contentParts.push({ type: "image_file", image_file: { file_id: fid } });
    }
  }

  // Agregar mensaje al thread
  await openai.beta.threads.messages.create(openaiThreadId, {
    role: "user",
    content: contentParts,
    ...(fileIds?.length > 0 && gpt.tools_enabled?.file_search
      ? {
          attachments: fileIds.map((fid: string) => ({
            file_id: fid,
            tools: [{ type: "file_search" }],
          })),
        }
      : {}),
  });

  // Stream de respuesta
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const run = openai.beta.threads.runs.stream(
          openaiThreadId,
          { assistant_id: gpt.openai_assistant_id }
        );

        // Enviar threadId al cliente en primer chunk
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ threadId: openaiThreadId })}\n\n`
          )
        );

        for await (const event of run) {
          if (
            event.event === "thread.message.delta" &&
            event.data.delta.content
          ) {
            for (const block of event.data.delta.content) {
              if (block.type === "text" && block.text?.value) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text: block.text.value })}\n\n`
                  )
                );
              }
            }
          }

          if (event.event === "thread.run.completed") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          if (event.event === "thread.run.failed") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Error en el asistente" })}\n\n`
              )
            );
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Error interno" })}\n\n`
          )
        );
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
