import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput } from "@/lib/chat-content";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? user : null;
}

// Chat efímero para que el admin pruebe un GPT (activo o no) antes de
// publicarlo. NO escribe en `threads`/`messages` — la Conversation de OpenAI
// se descarta al cerrar el modal, no aparece en el historial de nadie.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;

  let message: string, conversationId: string | undefined;
  try {
    ({ message, conversationId } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "Falta message" }, { status: 400 });

  const service = createServiceClient();
  const { data: gpt, error } = await service.from("gpts").select("system_prompt, model").eq("id", id).single();
  if (error || !gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  if (!conversationId) {
    const conversation = await openai.conversations.create({
      metadata: { user_id: user.id, gpt_id: id, test: "true" },
    });
    conversationId = conversation.id;
  }

  const tools: Tool[] = [{ type: "code_interpreter", container: { type: "auto" } }];
  const input = buildUserInput(message, []);

  const res = runStreamResponse({
    conversationId,
    model: gpt.model || "gpt-4.1-mini",
    instructions: gpt.system_prompt || "",
    input,
    tools,
  });
  res.headers.set("x-conversation-id", conversationId);
  return res;
}
