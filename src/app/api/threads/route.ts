import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
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
  if (!gptId) {
    return NextResponse.json({ error: "Falta gptId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("threads")
    .select("id, title, created_at, updated_at")
    .eq("gpt_id", gptId)
    .order("updated_at", { ascending: false });

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
