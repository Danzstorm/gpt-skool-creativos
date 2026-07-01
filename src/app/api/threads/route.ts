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
  return NextResponse.json(data);
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
  const rl = checkRateLimit(`thread-create:${user.id}`, 15, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { gptId } = await request.json();
  if (!gptId) {
    return NextResponse.json({ error: "Falta gptId" }, { status: 400 });
  }

  const openaiThread = await openai.beta.threads.create();

  const { data, error } = await supabase
    .from("threads")
    .insert({
      user_id: user.id,
      gpt_id: gptId,
      openai_thread_id: openaiThread.id,
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
