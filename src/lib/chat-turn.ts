import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import { getGptRuntimeConfig } from "@/lib/gpt-runtime-config";
import {
  parseChatTurnBody,
  parseRegenerateBody,
} from "@/lib/chat-turn-parse";
import { recordMessageAttachments } from "@/lib/message-attachments";
import { projectInstructionsOf, syncProjectContext } from "@/lib/project-instructions";
import { cleanGeneratedTitle, generateThreadTitle } from "@/lib/thread-title";
import {
  CONVERSATION_KEY_FINGERPRINT,
  ensureThreadConversation,
  needsConversationCheck,
} from "@/lib/conversation-sync";
import {
  acquireRouteThreadLease,
  applyOpenAiAttachmentPolicy,
  buildCodeInterpreterTools,
  loadOwnedIncomingFiles,
  messageAttachmentLabel,
  releaseLeaseIfNotStreamed,
  visionRejectsImages,
  VISION_DISABLED_ERROR,
  threadAttachmentNumbers,
} from "@/lib/chat-request";
import { fillMissingVideoDescriptions } from "@/lib/video-analyze";
import { releaseThreadLease, type ThreadLease } from "@/lib/thread-lease";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PRE_STREAM_ERROR = "No se pudo preparar la respuesta. Intenta de nuevo.";

export type ChatTurnUser = { id: string; email: string };

export type ChatTurnClients = {
  request: NextRequest;
  user: ChatTurnUser;
  supabase: SupabaseClient;
};

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

function quotaExceededMessage(limit: number | null): string {
  return `Alcanzaste tu límite de ${limit} mensajes este mes. Se reinicia el día 1.`;
}

function attachmentLookupLog(cause: unknown): { code?: unknown; message: string } {
  return {
    code:
      cause && typeof cause === "object" && "code" in cause ? cause.code : undefined,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

// Borra de la Conversation de OpenAI el último turno completo: el último
// mensaje del usuario y todo lo posterior (reasoning, herramientas, respuesta).
// Mirar solo 1-2 ítems dejaba el mensaje del usuario vivo cuando había ítems
// intermedios, y al reenviarlo quedaba duplicado (más tokens, pregunta doble).
async function deleteLastTurn(
  conversationId: string
): Promise<{ removedUser: boolean; removedAssistant: boolean }> {
  const recent = await openai.conversations.items.list(conversationId, {
    order: "desc",
    limit: 100,
  });
  const userIndex = recent.data.findIndex(
    (item) => item.type === "message" && item.role === "user"
  );
  // Sin mensaje de usuario visible: solo se toca una respuesta final suelta.
  const stale =
    userIndex === -1
      ? recent.data.slice(0, 1).filter((item) => item.type === "message" && item.role === "assistant")
      : recent.data.slice(0, userIndex + 1);
  for (const item of stale) {
    if (!item.id) continue;
    await openai.conversations.items.delete(item.id, { conversation_id: conversationId });
  }
  return {
    removedUser: userIndex !== -1,
    removedAssistant: stale.some((item) => item.type === "message" && item.role === "assistant"),
  };
}

async function withVideoDescriptions(
  serviceClient: SupabaseClient,
  userId: string,
  incoming: IncomingFile[]
): Promise<{ ok: true; files: IncomingFile[] } | { ok: false; response: NextResponse }> {
  const filled = await fillMissingVideoDescriptions(serviceClient, userId, incoming);
  if (!filled.ok) {
    return { ok: false, response: jsonError(filled.error, filled.status) };
  }
  return { ok: true, files: filled.files };
}

async function readJsonBody(request: NextRequest): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: jsonError("JSON inválido", 400) };
  }
}

/**
 * Orquestación de POST /api/chat: validación, cuota, adjuntos, lease y stream.
 */
export async function executeChatTurn({
  request,
  user,
  supabase,
}: ChatTurnClients): Promise<Response> {
  const parsedJson = await readJsonBody(request);
  if (!parsedJson.ok) return parsedJson.response;
  const parsed = parseChatTurnBody(parsedJson.body);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);

  const { gptId, threadId, message, replaceLast, requestedIds } = parsed;
  const serviceClient = createServiceClient();
  const [quota, gptRes, threadRes] = await Promise.all([
    checkMessageQuota(user.id, user.email),
    serviceClient
      .from("gpts")
      .select("system_prompt, model, vision_enabled")
      .eq("id", gptId)
      .eq("is_active", true)
      .single(),
    supabase
      .from("threads")
      .select(
        "openai_conversation_id, title, conversation_key_fingerprint, project_context_fingerprint, projects(instructions)"
      )
      .eq("id", threadId)
      .eq("gpt_id", gptId)
      .single(),
  ]);

  if (!quota.ok) {
    return jsonError(quotaExceededMessage(quota.limit), 403);
  }
  const gpt = gptRes.data;
  if (gptRes.error || !gpt) return jsonError("GPT no encontrado", 404);
  const thread = threadRes.data;
  if (threadRes.error || !thread) {
    return jsonError("Conversación no encontrada", 404);
  }
  const projectInstructions = projectInstructionsOf(thread);

  let incoming: IncomingFile[] = [];
  if (requestedIds.length > 0) {
    const owned = await loadOwnedIncomingFiles(serviceClient, user.id, requestedIds);
    if (!owned.ok) {
      if (owned.error.kind === "lookup") {
        console.error("chat attachment lookup error", attachmentLookupLog(owned.error.cause));
        return jsonError("No se pudieron validar los adjuntos", 500);
      }
      return jsonError("Uno de los adjuntos no existe o no pertenece a tu cuenta", 400);
    }
    incoming = owned.files;
    if (visionRejectsImages(gpt.vision_enabled, owned.files)) {
      return jsonError(VISION_DISABLED_ERROR, 400);
    }

    const availability = await applyOpenAiAttachmentPolicy(openai, owned.files, "strict", {
      skipOpenAiVerifyIds: owned.skipOpenAiVerifyIds,
    });
    if (!availability.ok) {
      return jsonError(availability.error, 400);
    }
    incoming = availability.files;
    const described = await withVideoDescriptions(serviceClient, user.id, incoming);
    if (!described.ok) return described.response;
    incoming = described.files;
  }

  const leaseResult = await acquireRouteThreadLease(supabase, threadId, "chat");
  if (!leaseResult.ok) return leaseResult.response;
  const lease: ThreadLease = leaseResult.lease;

  let handedToStream = false;
  try {
    let conversationId = thread.openai_conversation_id;
    if (!conversationId) {
      const conversation = await openai.conversations.create({
        metadata: { user_id: user.id, gpt_id: gptId },
      });
      conversationId = conversation.id;
      const { error: saveConversationError } = await supabase
        .from("threads")
        .update({
          openai_conversation_id: conversationId,
          conversation_key_fingerprint: CONVERSATION_KEY_FINGERPRINT,
        })
        .eq("id", threadId);
      if (saveConversationError) throw saveConversationError;
    } else {
      conversationId = await ensureThreadConversation({
        openai,
        supabase: serviceClient,
        threadId,
        conversationId,
        fingerprint: thread.conversation_key_fingerprint,
        metadata: { user_id: user.id, gpt_id: gptId },
      });
    }

    const tools = buildCodeInterpreterTools(incoming);

    if (replaceLast) {
      const removed = await deleteLastTurn(conversationId);
      const toDeleteLocal = removed.removedAssistant && removed.removedUser ? 2 : 1;

      const { data: lastLocal } = await serviceClient
        .from("messages")
        .select("id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(toDeleteLocal);
      if (lastLocal?.length) {
        const { error: deleteError } = await serviceClient
          .from("messages")
          .delete()
          .in("id", lastLocal.map((item) => item.id));
        if (deleteError) throw deleteError;
      }
    }

    const numbers = await threadAttachmentNumbers(serviceClient, threadId, user.id, incoming);
    const storedFiles = incoming.map((file) => {
      const n =
        file.type === "image"
          ? numbers.images.get(file.openai_file_id)
          : file.type === "video"
            ? numbers.videos.get(file.openai_file_id)
            : undefined;
      return n === undefined ? file : { ...file, n };
    });

    const { data: userMessage, error: userMessageError } = await serviceClient
      .from("messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "user",
        content: message.trim(),
        files: storedFiles.length > 0 ? storedFiles : null,
      })
      .select("id")
      .single();
    if (userMessageError) throw userMessageError;
    if (!userMessage) throw new Error("El mensaje se guardó sin devolver su identificador");
    await recordMessageAttachments(serviceClient, userMessage.id, incoming);

    await syncProjectContext({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId,
      instructions: projectInstructions,
      appliedFingerprint: thread.project_context_fingerprint,
      conversationRecreated: conversationId !== thread.openai_conversation_id,
    });

    const input = buildUserInput(message, incoming, numbers);
    const messageLabel = message.trim() || messageAttachmentLabel(incoming);
    const runtimeConfig = await getGptRuntimeConfig(serviceClient, gptId, {
      system_prompt: gpt.system_prompt,
      model: gpt.model,
    });
    const response = runStreamResponse({
      conversationId,
      model: runtimeConfig.model || "gpt-4.1-mini",
      instructions: runtimeConfig.system_prompt || "",
      hasAttachments: incoming.length > 0,
      input,
      tools,
      onAssistantText: async (text) => {
        const { error: assistantMessageError } = await serviceClient.from("messages").insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: text,
        });
        if (assistantMessageError) throw assistantMessageError;
      },
      onAfterDone: async (meta, emit) => {
        let titleTokensIn = 0;
        let titleTokensOut = 0;
        let titleCost = 0;
        if (thread.title === "Nueva conversación") {
          let title = cleanGeneratedTitle(messageLabel) || messageLabel.slice(0, 40);
          try {
            const generated = await generateThreadTitle(openai, messageLabel, meta.text);
            if (generated) {
              title = generated.title;
              titleTokensIn = generated.tokensIn;
              titleTokensOut = generated.tokensOut;
              titleCost = estimateCost(generated.model, generated.tokensIn, generated.tokensOut);
            }
          } catch (titleError) {
            console.error("thread title generation error", {
              error: titleError instanceof Error ? titleError.message : String(titleError),
            });
          }
          const { error: titleUpdateError } = await supabase
            .from("threads")
            .update({ title })
            .eq("id", threadId)
            .eq("title", "Nueva conversación");
          if (titleUpdateError) {
            console.error("thread title persist error", {
              code: titleUpdateError.code,
              message: titleUpdateError.message,
            });
          } else {
            emit({ thread_title: title });
          }
        }
        const { error: usageError } = await serviceClient.from("usage_events").insert({
          user_id: user.id,
          gpt_id: gptId,
          thread_id: threadId,
          model: meta.model,
          tokens_in: meta.tokensIn + titleTokensIn,
          tokens_out: meta.tokensOut + titleTokensOut,
          cost: estimateCost(meta.model, meta.tokensIn, meta.tokensOut) + titleCost,
        });
        if (usageError) {
          console.error("chat usage log error", {
            code: usageError.code,
            message: usageError.message,
          });
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
    console.error("chat pre-stream error", {
      gptId,
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(PRE_STREAM_ERROR, 500);
  } finally {
    await releaseLeaseIfNotStreamed(handedToStream, supabase, threadId, lease);
  }
}

/**
 * Orquestación de POST /api/chat/regenerate.
 * La cuota se comprueba ANTES del parseo, igual que en el handler original:
 * over-quota + JSON inválido sigue siendo 403, no 400.
 */
export async function executeRegenerateTurn({
  request,
  user,
  supabase,
}: ChatTurnClients): Promise<Response> {
  const quota = await checkMessageQuota(user.id, user.email);
  if (!quota.ok) {
    return jsonError(quotaExceededMessage(quota.limit), 403);
  }

  const parsedJson = await readJsonBody(request);
  if (!parsedJson.ok) return parsedJson.response;
  const parsed = parseRegenerateBody(parsedJson.body);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);
  const { gptId, threadId } = parsed;

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
    return jsonError("GPT no encontrado", 404);
  }
  if (threadRes.error || !threadRes.data?.openai_conversation_id) {
    return jsonError("Conversación no encontrada", 404);
  }
  const gptRow = gptRes.data;
  const gpt = await getGptRuntimeConfig(serviceClient, gptId, gptRow);
  const projectInstructions = projectInstructionsOf(threadRes.data);
  const storedConversationId = threadRes.data.openai_conversation_id;
  const isLegacyThread = needsConversationCheck(threadRes.data.conversation_key_fingerprint);

  const leaseResult = await acquireRouteThreadLease(supabase, threadId, "regenerate");
  if (!leaseResult.ok) return leaseResult.response;
  const lease: ThreadLease = leaseResult.lease;

  let handedToStream = false;
  try {
    const { data: lastUserMessage, error: lastUserError } = await serviceClient
      .from("messages")
      .select("content, files")
      .eq("thread_id", threadId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (lastUserError || !lastUserMessage) {
      return jsonError("No hay un mensaje para regenerar", 400);
    }

    const storedFiles = Array.isArray(lastUserMessage.files)
      ? (lastUserMessage.files as Array<{ openai_file_id?: unknown }>)
      : [];
    const fileIds = storedFiles.flatMap((file) =>
      typeof file?.openai_file_id === "string" ? [file.openai_file_id] : []
    );
    if (fileIds.length !== storedFiles.length) {
      return jsonError("Los adjuntos del mensaje no son válidos", 400);
    }

    let incoming: IncomingFile[] = [];
    if (fileIds.length > 0) {
      const owned = await loadOwnedIncomingFiles(serviceClient, user.id, fileIds);
      if (!owned.ok) {
        if (owned.error.kind === "lookup") throw owned.error.cause;
        return jsonError("Uno de los adjuntos ya no está disponible para regenerar", 400);
      }
      incoming = owned.files;
      if (visionRejectsImages(gptRow.vision_enabled, owned.files)) {
        return jsonError(VISION_DISABLED_ERROR, 400);
      }
      if (isLegacyThread) {
        const availability = await applyOpenAiAttachmentPolicy(
          openai,
          owned.files,
          "filter_unavailable"
        );
        if (availability.ok) incoming = availability.files;
      }
      const described = await withVideoDescriptions(serviceClient, user.id, incoming);
      if (!described.ok) return described.response;
      incoming = described.files;
    }

    const conversationId = await ensureThreadConversation({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId: storedConversationId,
      fingerprint: threadRes.data.conversation_key_fingerprint,
      metadata: { user_id: user.id, gpt_id: gptId },
    });

    // El mensaje del usuario se reenvía abajo con buildUserInput: hay que sacarlo
    // también de la Conversation, no solo la respuesta.
    const removed = await deleteLastTurn(conversationId);
    if (removed.removedAssistant) {
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
    await syncProjectContext({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId,
      instructions: projectInstructions,
      appliedFingerprint: threadRes.data.project_context_fingerprint,
      conversationRecreated: conversationId !== storedConversationId,
    });

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
      onAfterDone: async (meta) => {
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
    return jsonError(PRE_STREAM_ERROR, 500);
  } finally {
    await releaseLeaseIfNotStreamed(handedToStream, supabase, threadId, lease);
  }
}
