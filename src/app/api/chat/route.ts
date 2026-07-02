import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runStreamResponse } from "@/lib/chat-stream";
import { estimateCost } from "@/lib/pricing";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vercel corta funciones serverless por tiempo. Las respuestas de Assistants
// pueden tardar; sin esto el stream se corta a mitad. (El plan debe permitir >60s.)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite: 30 mensajes por minuto por usuario (protege saldo OpenAI de abuso)
  const rl = checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { gptId, threadId, message, files, replaceLast } = await request.json();

  if (!gptId || !message || !threadId) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Fetch assistant_id con service role (nunca expuesto al cliente)
  const { data: gpt, error: gptError } = await serviceClient
    .from("gpts")
    .select("openai_assistant_id")
    .eq("id", gptId)
    .eq("is_active", true)
    .single();

  if (gptError || !gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  // La fila de threads pertenece al usuario (RLS: user_id = auth.uid())
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("openai_thread_id, title")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const openaiThreadId = thread.openai_thread_id;

  // Separar archivos por tipo: imágenes van como contenido de visión;
  // documentos van como attachments para file_search + code_interpreter.
  type IncomingFile = { openai_file_id: string; type: "image" | "document" };
  const incoming: IncomingFile[] = Array.isArray(files) ? files : [];

  type MessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_file"; image_file: { file_id: string } };

  const contentParts: MessageContentPart[] = [{ type: "text", text: message }];
  for (const f of incoming) {
    if (f.type === "image") {
      contentParts.push({ type: "image_file", image_file: { file_id: f.openai_file_id } });
    }
  }

  const docAttachments = incoming
    .filter((f) => f.type === "document")
    .map((f) => ({
      file_id: f.openai_file_id,
      tools: [{ type: "file_search" as const }, { type: "code_interpreter" as const }],
    }));

  // Editar y reenviar: borrar el último turno (respuesta del asistente + mensaje del usuario) antes de reponer
  if (replaceLast) {
    const { data: recent } = await openai.beta.threads.messages.list(openaiThreadId, {
      order: "desc",
      limit: 2,
    });
    if (recent[0]?.role === "assistant") {
      await openai.beta.threads.messages.delete(recent[0].id, { thread_id: openaiThreadId });
      if (recent[1]?.role === "user") {
        await openai.beta.threads.messages.delete(recent[1].id, { thread_id: openaiThreadId });
      }
    } else if (recent[0]?.role === "user") {
      await openai.beta.threads.messages.delete(recent[0].id, { thread_id: openaiThreadId });
    }
  }

  // Agregar mensaje al thread
  await openai.beta.threads.messages.create(openaiThreadId, {
    role: "user",
    content: contentParts,
    ...(docAttachments.length > 0 ? { attachments: docAttachments } : {}),
  });

  return runStreamResponse(openaiThreadId, gpt.openai_assistant_id, async (meta) => {
    const isDefaultTitle = thread.title === "Nueva conversación";
    await supabase
      .from("threads")
      .update({
        updated_at: new Date().toISOString(),
        ...(isDefaultTitle && { title: message.slice(0, 40) }),
      })
      .eq("id", threadId);

    // Registrar evento de uso con tokens y costo estimado (best-effort)
    serviceClient
      .from("usage_events")
      .insert({
        user_id: user.id,
        gpt_id: gptId,
        thread_id: threadId,
        model: meta.model,
        tokens_in: meta.tokensIn,
        tokens_out: meta.tokensOut,
        cost: estimateCost(meta.model, meta.tokensIn, meta.tokensOut),
      })
      .then(() => {}, () => {});
  });
}
