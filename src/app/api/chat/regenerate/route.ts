import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = await checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { gptId, threadId } = await request.json();
  if (!gptId || !threadId) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: gpt, error: gptError } = await serviceClient
    .from("gpts")
    .select("system_prompt, model")
    .eq("id", gptId)
    .eq("is_active", true)
    .single();

  if (gptError || !gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  // Ownership del thread vía RLS
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("openai_conversation_id")
    .eq("id", threadId)
    .single();

  if (threadError || !thread || !thread.openai_conversation_id) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const { data: locked } = await supabase.rpc("acquire_thread_lock", { p_thread_id: threadId });
  if (!locked) {
    return NextResponse.json(
      { error: "Ya hay una respuesta en curso para esta conversación." },
      { status: 409 }
    );
  }

  const conversationId = thread.openai_conversation_id;

  // Borrar el último mensaje del asistente (Conversation + caché local) para regenerar una respuesta nueva
  const recentItems = await openai.conversations.items.list(conversationId, { order: "desc", limit: 1 });
  const last = recentItems.data[0];
  if (last?.type === "message" && last.role === "assistant") {
    await openai.conversations.items.delete(last.id, { conversation_id: conversationId });

    const { data: lastLocal } = await serviceClient
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (lastLocal && lastLocal.length > 0) {
      await serviceClient.from("messages").delete().eq("id", lastLocal[0].id);
    }
  }

  // La Responses API exige `input` en cada llamada (no se puede "continuar sin
  // aportar nada nuevo"), así que se reenvía el último mensaje del usuario como
  // input de esta nueva respuesta. Esto sí duplica ese turno en el historial que
  // ve el modelo dentro de la Conversation — aceptable para un "regenerar";
  // NO se vuelve a insertar en la tabla local `messages` (evita duplicar la
  // burbuja del usuario en la UI).
  const { data: lastUserMessage } = await serviceClient
    .from("messages")
    .select("content, files")
    .eq("thread_id", threadId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastUserMessage) {
    await supabase.rpc("release_thread_lock", { p_thread_id: threadId });
    return NextResponse.json({ error: "No hay un mensaje para regenerar" }, { status: 400 });
  }

  const input = buildUserInput(lastUserMessage.content, (lastUserMessage.files as IncomingFile[]) ?? []);

  return runStreamResponse({
    conversationId,
    model: gpt.model || "gpt-4.1-mini",
    instructions: gpt.system_prompt || "",
    input,
    onAssistantText: async (text) => {
      await serviceClient.from("messages").insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: text,
      });
    },
    onComplete: async (meta) => {
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
