import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  let title: string | undefined;
  try {
    ({ title } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!title || !title.trim()) {
    return NextResponse.json({ error: "Falta title" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("threads")
    .update({ title: title.trim() })
    .eq("id", id)
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const { data: thread } = await supabase
    .from("threads")
    .select("openai_conversation_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("threads").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (thread?.openai_conversation_id) {
    try {
      await openai.conversations.delete(thread.openai_conversation_id);
    } catch {
      // best-effort: no bloquear el borrado local si la Conversation ya no existe
    }
  }

  return NextResponse.json({ ok: true });
}
