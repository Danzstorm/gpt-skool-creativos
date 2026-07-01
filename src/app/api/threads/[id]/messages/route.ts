import { createClient } from "@/lib/supabase/server";
import { getThreadMessages } from "@/lib/openai-messages";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const { data: thread, error } = await supabase
    .from("threads")
    .select("openai_thread_id")
    .eq("id", id)
    .single();

  if (error || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = await getThreadMessages(thread.openai_thread_id);
  return NextResponse.json(messages);
}
