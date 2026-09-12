import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import { getGptRuntimeConfig } from "@/lib/gpt-runtime-config";
import { projectInstructionsOf, syncProjectContext } from "@/lib/project-instructions";
import { ensureThreadConversation, needsConversationCheck } from "@/lib/conversation-sync";
import {
  acquireRouteThreadLease,
  applyOpenAiAttachmentPolicy,
  buildCodeInterpreterTools,
  loadOwnedIncomingFiles,
  releaseLeaseIfNotStreamed,
  visionRejectsImages,
  VISION_DISABLED_ERROR,
  threadAttachmentNumbers,
} from "@/lib/chat-request";
import { releaseThreadLease, type ThreadLease } from "@/lib/thread-lease";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const quota = await checkMessageQuota(user.id, user.email!);
  if (!quota.ok) {
    return NextResponse.json(
      { error: `Alcanzaste tu límite de ${quota.limit} mensajes este mes. Se reinicia el día 1.` },
      { status: 403 }
    );
  }

  let gptId: unknown;
  let threadId: unknown;
  try {
    ({ gptId, threadId } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof gptId !== "string" || typeof threadId !== "string" || !gptId || !threadId) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const [gptRes, threadRes] = await Promise.all([
    serviceClient
      .from("gpts")
      .select("system_prompt, model, vision_enabled")
      .eq("id", gptId)
      .eq("is_active", true)
      .single(),
    supabase
      .from("threads")
      .select(
        "openai_conversation_id, conversation_key_fingerprint, project_context_fingerprint, projects(instructions)"
      )
      .eq("id", threadId)
      .eq("gpt_id", gptId)
      .single(),
  ]);
  if (gptRes.error || !gptRes.data) {
    return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  }
  if (threadRes.error || !threadRes.data?.openai_conversation_id) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }
  const gptRow = gptRes.data;
  const gpt = await getGptRuntimeConfig(serviceClient, gptId, gptRow);
  const projectInstructions = projectInstructionsOf(threadRes.data);
  const storedConversationId = threadRes.data.openai_conversation_id;
  // Thread heredado de otra API key: su Conversation y sus adjuntos pueden vivir
  // en un proyecto de OpenAI que esta cuenta no ve (ver conversation-sync.ts).
  const isLegacyThread = needsConversationCheck(threadRes.data.conversation_key_fingerprint);

  const leaseResult = await acquireRouteThreadLease(supabase, threadId, "regenerate");
  if (!leaseResult.ok) return leaseResult.response;
  const lease: ThreadLease = leaseResult.lease;

  let handedToStream = false;
  try {
    // Validar el turno antes de borrar su respuesta actual. Si un adjunto
    // histórico ya no existe, Regenerar falla sin destruir lo que el usuario ve.
    const { data: lastUserMessage, error: lastUserError } = await serviceClient
      .from("messages")
      .select("content, files")
      .eq("thread_id", threadId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (lastUserError || !lastUserMessage) {
      return NextResponse.json({ error: "No hay un mensaje para regenerar" }, { status: 400 });
    }

    const storedFiles = Array.isArray(lastUserMessage.files)
      ? (lastUserMessage.files as Array<{ openai_file_id?: unknown }>)
      : [];
    const fileIds = storedFiles.flatMap((file) =>
      typeof file?.openai_file_id === "string" ? [file.openai_file_id] : []
    );
    if (fileIds.length !== storedFiles.length) {
      return NextResponse.json({ error: "Los adjuntos del mensaje no son válidos" }, { status: 400 });
    }

    let incoming: IncomingFile[] = [];
    if (fileIds.length > 0) {
      const owned = await loadOwnedIncomingFiles(serviceClient, user.id, fileIds);
      if (!owned.ok) {
        if (owned.error.kind === "lookup") throw owned.error.cause;
        return NextResponse.json(
          { error: "Uno de los adjuntos ya no está disponible para regenerar" },
          { status: 400 }
        );
      }
      incoming = owned.files;
      if (visionRejectsImages(gptRow.vision_enabled, owned.files)) {
        return NextResponse.json({ error: VISION_DISABLED_ERROR }, { status: 400 });
      }
      if (isLegacyThread) {
        // Reenviar un file_id de la cuenta anterior tumba la regeneración
        // entera con "No such File object". Se omite el adjunto perdido: el
        // usuario sigue viendo su miniatura (sale de Storage) y el turno corre.
        const availability = await applyOpenAiAttachmentPolicy(
          openai,
          owned.files,
          "filter_unavailable"
        );
        if (availability.ok) incoming = availability.files;
      }
    }

    const conversationId = await ensureThreadConversation({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId: storedConversationId,
      fingerprint: threadRes.data.conversation_key_fingerprint,
      metadata: { user_id: user.id, gpt_id: gptId },
    });

    const recentItems = await openai.conversations.items.list(conversationId, {
      order: "desc",
      limit: 1,
    });
    const last = recentItems.data[0];
    if (last?.type === "message" && last.role === "assistant") {
      await openai.conversations.items.delete(last.id, { conversation_id: conversationId });
      const { data: lastLocal } = await serviceClient
        .from("messages")
        .select("id")
        .eq("thread_id", threadId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1);
      if (lastLocal?.length) {
        const { error: deleteError } = await serviceClient
          .from("messages")
          .delete()
          .eq("id", lastLocal[0].id);
        if (deleteError) throw deleteError;
      }
    }

    const tools = buildCodeInterpreterTools(incoming);
    // Casi siempre no hay nada que hacer: el contexto de la carpeta ya vive en
    // la Conversation. Importa cuando el texto cambió desde la última respuesta
    // —regenerar tiene que usar el nuevo, no el que se está reemplazando— y
    // cuando la Conversation se acaba de recrear, porque la nueva se sembró
    // desde `messages`, donde ese turno nunca se guarda.
    await syncProjectContext({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId,
      instructions: projectInstructions,
      appliedFingerprint: threadRes.data.project_context_fingerprint,
      conversationRecreated: conversationId !== storedConversationId,
    });

    // El turno del usuario sigue guardado (regenerar solo borra la respuesta),
    // así que la numeración sale igual que en /api/chat y no se corre.
    const numbers = await threadAttachmentNumbers(serviceClient, threadId, user.id);
    const input = buildUserInput(lastUserMessage.content, incoming, numbers);
    const response = runStreamResponse({
      conversationId,
      model: gpt.model || "gpt-4.1-mini",
      instructions: gpt.system_prompt || "",
      hasAttachments: incoming.length > 0,
      input,
      tools,
      onAssistantText: async (text) => {
        const { error } = await serviceClient.from("messages").insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: text,
        });
        if (error) throw error;
      },
      onComplete: async (meta) => {
        const { error } = await serviceClient.from("usage_events").insert({
          user_id: user.id,
          gpt_id: gptId,
          thread_id: threadId,
          model: meta.model,
          tokens_in: meta.tokensIn,
          tokens_out: meta.tokensOut,
          cost: estimateCost(meta.model, meta.tokensIn, meta.tokensOut),
        });
        if (error) {
          console.error("regenerate usage log error", { code: error.code, message: error.message });
        }
      },
      onSettled: async () => {
        await releaseThreadLease(supabase, threadId, lease);
      },
      signal: request.signal,
    });
    handedToStream = true;
    return response;
  } catch (error) {
    console.error("regenerate pre-stream error", {
      gptId,
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "No se pudo preparar la respuesta. Intenta de nuevo." },
      { status: 500 }
    );
  } finally {
    await releaseLeaseIfNotStreamed(handedToStream, supabase, threadId, lease);
  }
}
