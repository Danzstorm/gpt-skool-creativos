import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_PROJECT_NAME_CHARS = 100;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  let name: unknown;
  try {
    ({ name } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Falta name" }, { status: 400 });
  }
  if (name.length > MAX_PROJECT_NAME_CHARS) {
    return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, created_at, updated_at")
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

  // Las conversaciones de adentro sobreviven: threads.project_id tiene
  // ON DELETE SET NULL y vuelven a la lista suelta de Chats.
  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
