import { createServiceClient } from "@/lib/supabase/server";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput } from "@/lib/chat-content";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { estimateCost } from "@/lib/pricing";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";
import { requireAdmin } from "@/lib/require-admin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 20_000; // mismo tope que /api/chat

// Chat efímero para que el admin pruebe un GPT (activo o no) antes de
// publicarlo. NO escribe en `threads`/`messages` — la Conversation de OpenAI
// se descarta al cerrar el modal, no aparece en el historial de nadie.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // Era el único endpoint de chat sin límite: una sesión admin podía golpear a
  // OpenAI sin freno con maxDuration=60.
  const rl = await checkRateLimit(`admin-test-chat:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await params;

  let message: unknown, conversationId: unknown;
  try {
    ({ message, conversationId } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // typeof y no solo truthiness: `message` acababa en buildUserInput → .trim(),
  // así que un número o un objeto reventaba el handler con un 500.
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "Falta message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: gpt, error } = await service.from("gpts").select("system_prompt, model").eq("id", id).single();
  if (error || !gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });

  let activeConversationId: string;

  if (conversationId === undefined || conversationId === null) {
    const conversation = await openai.conversations.create({
      metadata: { user_id: user.id, gpt_id: id, test: "true" },
    });
    activeConversationId = conversation.id;
  } else {
    // El id venía del body y se usaba tal cual. Como todas las conversaciones
    // (las de prueba Y las reales de los miembros) viven en la misma cuenta de
    // OpenAI, eso permitía continuar —y leer— la conversación privada de
    // cualquier persona pasando su id. Se comprueba contra los metadatos que
    // pone la rama de arriba: solo una conversación de prueba, creada por este
    // mismo admin y para este mismo GPT, puede continuarse.
    if (typeof conversationId !== "string") {
      return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });
    }
    const existing = await openai.conversations.retrieve(conversationId).catch(() => null);
    const meta = (existing?.metadata ?? {}) as Record<string, string>;
    if (!existing || meta.test !== "true" || meta.user_id !== user.id || meta.gpt_id !== id) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    activeConversationId = existing.id;
  }

  const tools: Tool[] = [{ type: "code_interpreter", container: { type: "auto" } }];
  const input = buildUserInput(message, []);

  const res = runStreamResponse({
    conversationId: activeConversationId,
    model: gpt.model || "gpt-4.1-mini",
    instructions: gpt.system_prompt || "",
    input,
    tools,
    // El gasto de las pruebas del admin también es dinero de la cuenta de
    // OpenAI del cliente, y antes no dejaba rastro en ninguna parte: el panel
    // de /admin agrega `usage_events` y aquí no se escribía nada. thread_id
    // queda null porque este chat, a propósito, no crea thread.
    onComplete: async (meta) => {
      const { error: usageError } = await service.from("usage_events").insert({
        user_id: user.id,
        gpt_id: id,
        thread_id: null,
        model: meta.model,
        tokens_in: meta.tokensIn,
        tokens_out: meta.tokensOut,
        cost: estimateCost(meta.model, meta.tokensIn, meta.tokensOut),
      });
      if (usageError) {
        console.error("admin test-chat usage log error", {
          code: usageError.code,
          message: usageError.message,
        });
      }
    },
    // Sin esto el servidor seguía generando (y pagando) tokens después de que
    // el admin cerrase el modal.
    signal: request.signal,
  });
  res.headers.set("x-conversation-id", activeConversationId);
  return res;
}
