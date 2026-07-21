import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return profile?.is_admin ? user : null;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("gpts")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // threads.gpt_id tiene ON DELETE CASCADE (arrastra threads y messages), así
  // que el admin necesita ver cuántas conversaciones de miembros hay antes de
  // decidir borrar un GPT — no solo un `confirm()` genérico. Un COUNT por GPT
  // en paralelo (hay 8 hoy) es más barato que traer todos los threads a JS
  // para contarlos a mano, y usa el índice idx_threads_gpt.
  const withCounts = await Promise.all(
    (data ?? []).map(async (gpt) => {
      const { count } = await serviceClient
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("gpt_id", gpt.id);
      return { ...gpt, thread_count: count ?? 0 };
    })
  );

  return NextResponse.json(withCounts);
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- body de forma libre, validado campo a campo abajo
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { name, description, category, system_prompt, model, conversation_starters, sort_order, icon_url, author } = body;

  if (!name || !system_prompt) {
    return NextResponse.json({ error: "Nombre y system prompt requeridos" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("gpts")
    .insert({
      name,
      description,
      category: category || "General",
      icon_url: icon_url || null,
      author: author || null,
      system_prompt,
      model: model || "gpt-4.1-mini",
      // Todos los GPTs tienen todas las capacidades (archivos, código, visión). No es configurable.
      tools_enabled: { file_search: true, code_interpreter: true },
      vision_enabled: true,
      conversation_starters: Array.isArray(conversation_starters) ? conversation_starters : [],
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
