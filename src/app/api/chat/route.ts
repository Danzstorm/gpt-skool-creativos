import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import { MAX_FILES_PER_MESSAGE } from "@/lib/upload-file";
import { getGptRuntimeConfig } from "@/lib/gpt-runtime-config";
import { recordMessageAttachments } from "@/lib/message-attachments";
import { projectInstructionsOf, syncProjectContext } from "@/lib/project-instructions";
import { generateThreadTitle } from "@/lib/thread-title";
import {
  CONVERSATION_KEY_FINGERPRINT,
  ensureThreadConversation,
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
} from "@/lib/chat-request";
import { releaseThreadLease, type ThreadLease } from "@/lib/thread-lease";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Los turnos con varias imágenes pueden superar el límite normal de una
// función serverless antes de producir el primer token.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`chat:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: {
    gptId?: unknown;
    threadId?: unknown;
    message?: unknown;
    files?: unknown;
    replaceLast?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { gptId, threadId, message } = body;
  const replaceLast = body.replaceLast === true;
  if (
    typeof gptId !== "string" ||
    typeof threadId !== "string" ||
    typeof message !== "string" ||
    !gptId ||
    !threadId
  ) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }
  if (message.length > 20_000) {
    return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 400 });
  }

  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (rawFiles.length > MAX_FILES_PER_MESSAGE) {
    return NextResponse.json(
      { error: `Puedes adjuntar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.` },
      { status: 400 }
    );
  }
  const requestedIds = rawFiles.flatMap((file) =>
    file &&
    typeof file === "object" &&
    "openai_file_id" in file &&
    typeof file.openai_file_id === "string"
      ? [file.openai_file_id]
      : []
  );
  if (requestedIds.length !== rawFiles.length || new Set(requestedIds).size !== requestedIds.length) {
    return NextResponse.json({ error: "Adjuntos inválidos" }, { status: 400 });
  }
  if (!message.trim() && requestedIds.length === 0) {
    return NextResponse.json({ error: "El mensaje está vacío" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const [quota, gptRes, threadRes] = await Promise.all([
    checkMessageQuota(user.id, user.email!),
    serviceClient
      .from("gpts")
      .select("system_prompt, model, vision_enabled")
      .eq("id", gptId)
      .eq("is_active", true)
      .single(),
    // La igualdad de gpt_id evita usar un thread válido con las instrucciones
    // de otro GPT.
    //
    // `projects(instructions)` viaja en la misma query, no en una segunda: el
    // contexto de la carpeta se necesita antes del primer token y un round-trip
    // más a Postgres se pagaría en cada mensaje. Va por el cliente del usuario,
    // así que RLS ya garantiza que la carpeta sea suya.
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
    return NextResponse.json(
      { error: `Alcanzaste tu límite de ${quota.limit} mensajes este mes. Se reinicia el día 1.` },
      { status: 403 }
    );
  }
  const gpt = gptRes.data;
  if (gptRes.error || !gpt) return NextResponse.json({ error: "GPT no encontrado" }, { status: 404 });
  const thread = threadRes.data;
  if (threadRes.error || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }
  const projectInstructions = projectInstructionsOf(thread);

  let incoming: IncomingFile[] = [];
  if (requestedIds.length > 0) {
    const owned = await loadOwnedIncomingFiles(serviceClient, user.id, requestedIds);
    if (!owned.ok) {
      if (owned.error.kind === "lookup") {
        console.error("chat attachment lookup error", {
          code:
            owned.error.cause &&
            typeof owned.error.cause === "object" &&
            "code" in owned.error.cause
              ? owned.error.cause.code
              : undefined,
          message:
            owned.error.cause instanceof Error
              ? owned.error.cause.message
              : String(owned.error.cause),
        });
        return NextResponse.json({ error: "No se pudieron validar los adjuntos" }, { status: 500 });
      }
      return NextResponse.json(
        { error: "Uno de los adjuntos no existe o no pertenece a tu cuenta" },
        { status: 400 }
      );
    }
    incoming = owned.files;
    if (visionRejectsImages(gpt.vision_enabled, owned.files)) {
      return NextResponse.json({ error: VISION_DISABLED_ERROR }, { status: 400 });
    }

    const availability = await applyOpenAiAttachmentPolicy(openai, owned.files, "strict");
    if (!availability.ok) {
      return NextResponse.json({ error: availability.error }, { status: 400 });
    }
    incoming = availability.files;
  }

  const leaseResult = await acquireRouteThreadLease(supabase, threadId, "chat");
  if (!leaseResult.ok) return leaseResult.response;
  const lease: ThreadLease = leaseResult.lease;

  // runStreamResponse libera el lock al terminar el stream. Si algo falla
  // antes de entregárselo, este finally cubre ese camino.
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
      // Un thread creado con otra API key apunta a una Conversation que esta
      // cuenta no puede ver: se recrea con el historial local antes de seguir.
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
      const recentItems = await openai.conversations.items.list(conversationId, {
        order: "desc",
        limit: 2,
      });
      const [first, second] = recentItems.data;
      let toDeleteLocal = 1;
      if (first?.type === "message" && first.role === "assistant") {
        await openai.conversations.items.delete(first.id, { conversation_id: conversationId });
        if (second?.type === "message" && second.role === "user") {
          await openai.conversations.items.delete(second.id, { conversation_id: conversationId });
          toDeleteLocal = 2;
        }
      } else if (first?.type === "message" && first.role === "user") {
        await openai.conversations.items.delete(first.id, { conversation_id: conversationId });
      }

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

    const { data: userMessage, error: userMessageError } = await serviceClient
      .from("messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "user",
        content: message.trim(),
        files: incoming.length > 0 ? incoming : null,
      })
      .select("id")
      .single();
    if (userMessageError) throw userMessageError;
    if (!userMessage) throw new Error("El mensaje se guardó sin devolver su identificador");
    await recordMessageAttachments(serviceClient, userMessage.id, incoming);

    // El contexto de la carpeta vive UNA vez en la Conversation, no se reenvía
    // en cada mensaje. Esto lo pone al día antes de responder: lo crea, lo
    // reemplaza si el texto cambió, o lo borra si el chat salió de la carpeta.
    // Un id distinto al guardado significa que la Conversation se creó o se
    // recreó en esta misma request, y entonces no tiene nada aplicado todavía.
    await syncProjectContext({
      openai,
      supabase: serviceClient,
      threadId,
      conversationId,
      instructions: projectInstructions,
      appliedFingerprint: thread.project_context_fingerprint,
      conversationRecreated: conversationId !== thread.openai_conversation_id,
    });

    const input = buildUserInput(message, incoming);
    const messageLabel = message.trim() || messageAttachmentLabel(incoming);
    const runtimeConfig = await getGptRuntimeConfig(serviceClient, gptId, {
      system_prompt: gpt.system_prompt,
      model: gpt.model,
    });
    const response = runStreamResponse({
      conversationId,
      model: runtimeConfig.model || "gpt-4.1-mini",
      // Solo el prompt del admin. El texto de la carpeta va en `input`, como un
      // turno de usuario: es de quien viene y es la autoridad que le toca.
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
      onComplete: async (meta) => {
        // Costo del título fusionado en el ÚNICO usage_events de este turno
        // (no una fila aparte): admin_top_users/admin_stats_summary cuentan
        // filas de esta tabla como "mensajes" (ver migración
        // 20260704020421_admin_dashboard_rpc_v2.sql). Una fila extra por chat
        // nuevo inflaba ese conteo sin que nadie hubiera mandado un mensaje más.
        let titleTokensIn = 0;
        let titleTokensOut = 0;
        let titleCost = 0;
        if (thread.title === "Nueva conversación") {
          let title = messageLabel.slice(0, 40);
          try {
            const generated = await generateThreadTitle(openai, messageLabel, meta.text);
            if (generated) {
              title = generated.title;
              titleTokensIn = generated.tokensIn;
              titleTokensOut = generated.tokensOut;
              titleCost = estimateCost(generated.model, generated.tokensIn, generated.tokensOut);
            }
          } catch (titleError) {
            // Nunca debe tirar abajo el turno del usuario: si falla, el chat
            // se queda con el truncado de siempre en vez de un título lindo.
            console.error("thread title generation error", {
              error: titleError instanceof Error ? titleError.message : String(titleError),
            });
          }
          await supabase.from("threads").update({ title }).eq("id", threadId);
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
    return NextResponse.json(
      { error: "No se pudo preparar la respuesta. Intenta de nuevo." },
      { status: 500 }
    );
  } finally {
    await releaseLeaseIfNotStreamed(handedToStream, supabase, threadId, lease);
  }
}
