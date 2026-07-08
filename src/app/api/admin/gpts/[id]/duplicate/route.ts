import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? user : null;
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: original, error: fetchError } = await service.from("gpts").select("*").eq("id", id).single();
  if (fetchError || !original) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  // Copia inactiva por defecto: el admin la revisa/ajusta antes de publicarla a los alumnos.
  const { data, error } = await service
    .from("gpts")
    .insert({
      name: `${original.name} (copia)`,
      description: original.description,
      category: original.category,
      icon_url: original.icon_url,
      author: original.author,
      system_prompt: original.system_prompt,
      model: original.model,
      tools_enabled: original.tools_enabled,
      vision_enabled: original.vision_enabled,
      conversation_starters: original.conversation_starters,
      is_active: false,
      sort_order: original.sort_order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
