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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { name, description, category, system_prompt, model, tools_enabled, vision_enabled, sort_order, is_active } = body;

  const serviceClient = createServiceClient();
  const { data: gpt } = await serviceClient.from("gpts").select("openai_assistant_id").eq("id", id).single();
  if (!gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  const tools: OpenAI.Beta.Assistants.AssistantTool[] = [];
  if (tools_enabled?.file_search) tools.push({ type: "file_search" });
  if (tools_enabled?.code_interpreter) tools.push({ type: "code_interpreter" });

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
      ...(tools_enabled && { tools_enabled }),
      ...(vision_enabled !== undefined && { vision_enabled }),
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
