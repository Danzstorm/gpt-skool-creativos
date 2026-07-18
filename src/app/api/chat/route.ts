import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vercel corta funciones serverless por tiempo. Las respuestas del modelo
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
  const rl = await checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  let gptId: string, threadId: string, message: string, files: unknown, replaceLast: boolean | undefined;
  try {
    ({ gptId, threadId, message, files, replaceLast } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!gptId || !message || !threadId) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Cuota + GPT + thread son independientes → en paralelo se paga UN solo viaje de
  // latencia en vez de tres en fila (baja el tiempo hasta el primer token).
  const [quota, gptRes, threadRes] = await Promise.all([
    // Cuota mensual (config del admin): corta antes de gastar en OpenAI.
    checkMessageQuota(user.id, user.email!),
    serviceClient
      .from("gpts")
      .select("system_prompt, model")
      .eq("id", gptId)
      .eq("is_active", true)
      .single(),
    // La fila de threads pertenece al usuario (RLS: user_id = auth.uid())
    supabase
      .from("threads")
      .select("openai_conversation_id, title")
      .eq("id", threadId)
      .single(),
  ]);

  if (!quota.ok) {
    return NextResponse.json(
      { error: `Alcanzaste tu límite de ${quota.limit} mensajes este mes. Se reinicia el día 1.` },
      { status: 403 }
    );
  }

  const gpt = gptRes.data;
  if (gptRes.error || !gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  const thread = threadRes.data;
  if (threadRes.error || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // Lock: evita 2 respuestas concurrentes sobre el mismo thread (2 pestañas, doble envío).
  const { data: locked } = await supabase.rpc("acquire_thread_lock", { p_thread_id: threadId });
  if (!locked) {
    return NextResponse.json(
      { error: "Ya hay una respuesta en curso para esta conversación." },
      { status: 409 }
    );
  }

  let conversationId = thread.openai_conversation_id;
  if (!conversationId) {
    const conversation = await openai.conversations.create({
      metadata: { user_id: user.id, gpt_id: gptId },
    });
    conversationId = conversation.id;
    await supabase.from("threads").update({ openai_conversation_id: conversationId }).eq("id", threadId);
  }

  const incoming: IncomingFile[] = Array.isArray(files) ? files : [];
  const docFileIds = incoming.filter((f) => f.type === "document").map((f) => f.openai_file_id);

  // Todos los GPTs pueden ejecutar código (equivalente a code_interpreter siempre activo en Assistants).
  const tools: Tool[] = [
    { type: "code_interpreter", container: { type: "auto", ...(docFileIds.length > 0 && { file_ids: docFileIds }) } },
  ];

  // Editar y reenviar: borrar el último turno (respuesta del asistente + mensaje del usuario)
  // tanto de la Conversation de OpenAI como de la caché local, antes de reponer.
  if (replaceLast) {
    const recentItems = await openai.conversations.items.list(conversationId, {
      order: "desc",
      limit: 2,
    });
    const [first, second] = recentItems.data;
    let toDeleteLocal = 1;
    if (first?.type === "message" && first.role === "assistant") {
      await openai.conversations.items.delete(first.id, { conversation_id: conversationId });
      if (second?.type === "message" && second.role === "user") {
        await openai.conversations.items.delete(second.id, { conversation_id: conversationId });
        toDeleteLocal = 2;
      }
    } else if (first?.type === "message" && first.role === "user") {
      await openai.conversations.items.delete(first.id, { conversation_id: conversationId });
    }

    const { data: lastLocal } = await serviceClient
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(toDeleteLocal);
    if (lastLocal && lastLocal.length > 0) {
      await serviceClient.from("messages").delete().in("id", lastLocal.map((m) => m.id));
    }
  }

  await serviceClient.from("messages").insert({
    thread_id: threadId,
    user_id: user.id,
    role: "user",
    content: message,
    files: incoming.length > 0 ? incoming : null,
  });

  const input = buildUserInput(message, incoming);

  return runStreamResponse({
    conversationId,
    model: gpt.model || "gpt-4.1-mini",
    instructions: gpt.system_prompt || "",
    input,
    tools,
    onAssistantText: async (text) => {
      await serviceClient.from("messages").insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: text,
      });
    },
    onComplete: async (meta) => {
      // updated_at se actualiza solo (trigger); acá solo el título si sigue siendo el default.
      const isDefaultTitle = thread.title === "Nueva conversación";
      if (isDefaultTitle) {
        await supabase.from("threads").update({ title: message.slice(0, 40) }).eq("id", threadId);
      }

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
    },
    onSettled: async () => {
      await supabase.rpc("release_thread_lock", { p_thread_id: threadId });
    },
  });
}
