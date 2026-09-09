import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const MAX_TITLE_CHARS = 200;

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
  let body: { title?: unknown; project_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Un solo PATCH para renombrar y para mover entre proyectos: son la misma
  // fila y el mismo permiso, así que un endpoint aparte solo duplicaría la
  // comprobación de sesión. Los campos son independientes — se manda el que se
  // quiere cambiar.
  const update: { title?: string; project_id?: string | null } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title inválido" }, { status: 400 });
    }
    // Sin tope, el título se guardaba entero: lo pinta el sidebar y lo escribe
    // quien renombra la conversación.
    if (body.title.length > MAX_TITLE_CHARS) {
      return NextResponse.json({ error: "El título es demasiado largo" }, { status: 400 });
    }
    update.title = body.title.trim();
  }

  if (body.project_id !== undefined) {
    if (body.project_id !== null && typeof body.project_id !== "string") {
      return NextResponse.json({ error: "project_id inválido" }, { status: 400 });
    }
    if (typeof body.project_id === "string") {
      // La FK de threads.project_id no pasa por RLS, así que sola aceptaría el
      // id de un proyecto ajeno. Este SELECT sí pasa por RLS: si no vuelve
      // nada, el proyecto no existe o no es de quien pide.
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("id", body.project_id)
        .maybeSingle();
      if (!project) {
        return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
      }
    }
    update.project_id = body.project_id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("threads")
    .update(update)
    .eq("id", id)
    .select("id, title, project_id, created_at, updated_at")
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
