import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? user : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const serviceClient = createServiceClient();

  const { data: gpt, error } = await serviceClient.from("gpts").select("*").eq("id", id).single();
  if (error || !gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  return NextResponse.json(gpt);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { name, description, category, system_prompt, model, conversation_starters, sort_order, is_active, icon_url } = body;

  const serviceClient = createServiceClient();
  const { data: gpt } = await serviceClient.from("gpts").select("id").eq("id", id).single();
  if (!gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  const { data, error } = await serviceClient
    .from("gpts")
    .update({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(category && { category }),
      ...(icon_url !== undefined && { icon_url }),
      ...(system_prompt && { system_prompt }),
      ...(model && { model }),
      // Todos los GPTs mantienen todas las capacidades.
      tools_enabled: { file_search: true, code_interpreter: true },
      vision_enabled: true,
      ...(conversation_starters !== undefined && { conversation_starters }),
      ...(sort_order !== undefined && { sort_order }),
      ...(is_active !== undefined && { is_active }),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const serviceClient = createServiceClient();

  const { data: gpt } = await serviceClient.from("gpts").select("id").eq("id", id).single();
  if (!gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  await serviceClient.from("gpts").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
