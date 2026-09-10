import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_PROJECT_NAME_CHARS = 100;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, instructions, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = await checkRateLimit(`project-create:${user.id}`, 15, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  let name: unknown;
  let threadIds: unknown;
  try {
    ({ name, threadIds } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Falta name" }, { status: 400 });
  }
  if (name.length > MAX_PROJECT_NAME_CHARS) {
    return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
  }
  if (threadIds !== undefined && !Array.isArray(threadIds)) {
    return NextResponse.json({ error: "threadIds inválido" }, { status: 400 });
  }
  const ids = (threadIds ?? []).filter((id: unknown): id is string => typeof id === "string");

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: name.trim() })
    .select("id, name, instructions, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Crear y mover en una sola llamada: el gesto de arrastrar un chat sobre otro
  // arma la carpeta con los dos adentro, y dos round-trips dejarían un proyecto
  // vacío en pantalla si el segundo fallara.
  if (ids.length > 0) {
    // `eq("user_id")` explícito además de RLS: sin el filtro, un id ajeno no
    // erroraría, simplemente no afectaría filas — y el cliente creería que se
    // movió. Con el filtro, lo que vuelve en `moved` es la verdad.
    const { data: moved, error: moveError } = await supabase
      .from("threads")
      .update({ project_id: project.id })
      .in("id", ids)
      .eq("user_id", user.id)
      .select("id");

    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });
    return NextResponse.json({ ...project, moved_thread_ids: (moved ?? []).map((t) => t.id) });
  }

  return NextResponse.json({ ...project, moved_thread_ids: [] });
}
