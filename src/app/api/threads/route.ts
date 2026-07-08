import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const gptId = request.nextUrl.searchParams.get("gptId");

  let query = supabase
    .from("threads")
    .select("id, title, gpt_id, created_at, updated_at")
    .order("updated_at", { ascending: false });

  // gptId opcional: sin él devuelve todas las conversaciones del usuario (cross-GPT)
  if (gptId) query = query.eq("gpt_id", gptId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Preview del último mensaje por conversación (una sola query vía RPC, no N+1).
  const ids = (data ?? []).map((t) => t.id);
  const previews = new Map<string, string>();
  if (ids.length > 0) {
    const { data: recent } = await supabase.rpc("latest_messages_for_threads", { thread_ids: ids });
    for (const m of recent ?? []) {
      previews.set(m.thread_id, m.content.slice(0, 80));
    }
  }

  const withPreviews = (data ?? []).map((t) => ({
    ...t,
    last_message_preview: previews.get(t.id),
  }));

  return NextResponse.json(withPreviews);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite: 15 conversaciones nuevas por minuto por usuario (evita spam de threads)
  const rl = await checkRateLimit(`thread-create:${user.id}`, 15, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  let gptId: string | undefined;
  try {
    ({ gptId } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!gptId) {
    return NextResponse.json({ error: "Falta gptId" }, { status: 400 });
  }

  // Validar que el GPT existe y está activo antes de crear la Conversation en
  // OpenAI: evita conversaciones huérfanas si el id no existe o fue desactivado.
  const { data: gpt } = await supabase.from("gpts_public").select("id").eq("id", gptId).single();
  if (!gpt) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }

  const conversation = await openai.conversations.create({
    metadata: { user_id: user.id, gpt_id: gptId },
  });

  const { data, error } = await supabase
    .from("threads")
    .insert({
      user_id: user.id,
      gpt_id: gptId,
      openai_conversation_id: conversation.id,
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
