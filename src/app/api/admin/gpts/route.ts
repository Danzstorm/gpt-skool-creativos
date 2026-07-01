import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { name, description, category, system_prompt, model, tools_enabled, vision_enabled, sort_order } = await request.json();

  if (!name || !system_prompt) {
    return NextResponse.json({ error: "Nombre y system prompt requeridos" }, { status: 400 });
  }

  const tools: OpenAI.Beta.Assistants.AssistantTool[] = [];
  if (tools_enabled?.file_search) tools.push({ type: "file_search" });
  if (tools_enabled?.code_interpreter) tools.push({ type: "code_interpreter" });

  const assistant = await openai.beta.assistants.create({
    name,
    description,
    instructions: system_prompt,
    model: model || "gpt-4.1",
    tools,
  });

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("gpts")
    .insert({
      name,
      description,
      category: category || "General",
      openai_assistant_id: assistant.id,
      tools_enabled: tools_enabled || { file_search: true, code_interpreter: false },
      vision_enabled: vision_enabled ?? true,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
