import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { MAX_PROJECT_INSTRUCTIONS_CHARS } from "@/lib/project-instructions";

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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Parcial a propósito: renombrar y editar las instrucciones son dos gestos
  // distintos de la UI. Si el PATCH exigiera ambos campos, guardar el texto de
  // la carpeta tendría que reenviar el nombre y una carrera entre las dos
  // pantallas pisaría el rename recién hecho.
  const update: { name?: string; instructions?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Falta name" }, { status: 400 });
    }
    if (body.name.length > MAX_PROJECT_NAME_CHARS) {
      return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
    }
    update.name = body.name.trim();
  }

  if (body.instructions !== undefined) {
    if (body.instructions !== null && typeof body.instructions !== "string") {
      return NextResponse.json({ error: "instructions inválido" }, { status: 400 });
    }
    const text = typeof body.instructions === "string" ? body.instructions.trim() : "";
    // El tope se valida acá aunque la base tenga su CHECK: sin esto el error
    // vuelve como un 500 de Postgres y el usuario pierde lo que escribió.
    if (text.length > MAX_PROJECT_INSTRUCTIONS_CHARS) {
      return NextResponse.json(
        { error: `Las instrucciones no pueden pasar de ${MAX_PROJECT_INSTRUCTIONS_CHARS} caracteres` },
        { status: 400 }
      );
    }
    // Vacío se guarda como NULL: "sin instrucciones" es una sola cosa, no dos
    // estados que después haya que distinguir en cada lectura.
    update.instructions = text || null;
  }

  if (update.name === undefined && update.instructions === undefined) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select("id, name, instructions, created_at, updated_at")
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
