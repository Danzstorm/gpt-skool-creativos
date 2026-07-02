import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runStreamResponse } from "@/lib/chat-stream";
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

  const rl = checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { gptId, threadId } = await request.json();
  if (!gptId || !threadId) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: gpt, error: gptError } = await serviceClient
    .from("gpts")
    .select("openai_assistant_id")
    .eq("id", gptId)
    .eq("is_active", true)
    .single();

  if (gptError || !gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  // Ownership del thread vía RLS
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("openai_thread_id")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const openaiThreadId = thread.openai_thread_id;

  // Borrar el último mensaje del asistente para regenerar una respuesta nueva
  const { data: last } = await openai.beta.threads.messages.list(openaiThreadId, {
    order: "desc",
    limit: 1,
  });
  if (last[0]?.role === "assistant") {
    await openai.beta.threads.messages.delete(last[0].id, { thread_id: openaiThreadId });
  }

  return runStreamResponse(openaiThreadId, gpt.openai_assistant_id, async (meta) => {
    await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
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
