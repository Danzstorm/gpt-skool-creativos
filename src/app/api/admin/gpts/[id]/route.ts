import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  // Traer instructions + model reales desde OpenAI (no viven en nuestra DB)
  let system_prompt = "";
  let model = "gpt-4.1";
  try {
    const assistant = await openai.beta.assistants.retrieve(gpt.openai_assistant_id);
    system_prompt = assistant.instructions ?? "";
    model = assistant.model;
  } catch {
    // asistente no disponible; devolver vacío para no bloquear la edición
  }

  return NextResponse.json({ ...gpt, system_prompt, model });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { name, description, category, system_prompt, model, conversation_starters, sort_order, is_active } = body;

  const serviceClient = createServiceClient();
  const { data: gpt } = await serviceClient.from("gpts").select("openai_assistant_id").eq("id", id).single();
  if (!gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  // Todos los GPTs mantienen todas las capacidades. Solo se re-afirman en cada update.
  const tools: OpenAI.Beta.Assistants.AssistantTool[] = [
    { type: "file_search" },
    { type: "code_interpreter" },
  ];

  await openai.beta.assistants.update(gpt.openai_assistant_id, {
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(system_prompt && { instructions: system_prompt }),
    ...(model && { model }),
    tools,
  });

  const { data, error } = await serviceClient
    .from("gpts")
    .update({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(category && { category }),
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

  const { data: gpt } = await serviceClient.from("gpts").select("openai_assistant_id").eq("id", id).single();
  if (!gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  await openai.beta.assistants.delete(gpt.openai_assistant_id);
  await serviceClient.from("gpts").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
