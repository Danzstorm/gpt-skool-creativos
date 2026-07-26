import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import { MAX_FILES_PER_MESSAGE } from "@/lib/upload-file";
import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Los turnos con varias imágenes pueden superar el límite normal de una
// función serverless antes de producir el primer token.
export const maxDuration = 300;

function attachmentLabel(files: IncomingFile[]): string {
  if (files.length === 1) return files[0].type === "image" ? "Imagen adjunta" : "Archivo adjunto";
  return files.every((file) => file.type === "image")
    ? `${files.length} imágenes adjuntas`
    : `${files.length} archivos adjuntos`;
}

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
    supabase
      .from("threads")
      .select("openai_conversation_id, title")
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

  // Nunca confiar en el `type` enviado por el navegador: el mapa server-side
  // acredita ownership y contiene el MIME detectado durante el registro.
  let incoming: IncomingFile[] = [];
  if (requestedIds.length > 0) {
    const { data: ownedFiles, error: ownedFilesError } = await serviceClient
      .from("uploaded_files")
      .select("openai_file_id, mime")
      .eq("user_id", user.id)
      .in("openai_file_id", requestedIds);
    if (ownedFilesError) {
      console.error("chat attachment lookup error", {
        code: ownedFilesError.code,
        message: ownedFilesError.message,
      });
      return NextResponse.json({ error: "No se pudieron validar los adjuntos" }, { status: 500 });
    }

    const byId = new Map((ownedFiles ?? []).map((file) => [file.openai_file_id, file]));
    if (byId.size !== requestedIds.length) {
      return NextResponse.json(
        { error: "Uno de los adjuntos no existe o no pertenece a tu cuenta" },
        { status: 400 }
      );
    }
    incoming = requestedIds.map((id) => ({
      openai_file_id: id,
      type: byId.get(id)?.mime?.startsWith("image/") ? "image" : "document",
    }));
    if (!gpt.vision_enabled && incoming.some((file) => file.type === "image")) {
      return NextResponse.json({ error: "Este GPT no admite imágenes" }, { status: 400 });
    }
  }

  const { data: locked, error: lockError } = await supabase.rpc("acquire_thread_lock", {
    p_thread_id: threadId,
  });
  if (lockError) {
    console.error("chat lock error", { code: lockError.code, message: lockError.message });
    return NextResponse.json({ error: "No se pudo iniciar la respuesta" }, { status: 500 });
  }
  if (!locked) {
    return NextResponse.json(
      { error: "Ya hay una respuesta en curso para esta conversación." },
      { status: 409 }
    );
  }

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
        .update({ openai_conversation_id: conversationId })
        .eq("id", threadId);
      if (saveConversationError) throw saveConversationError;
    }

    const docFileIds = incoming
      .filter((file) => file.type === "document")
      .map((file) => file.openai_file_id);
    const tools: Tool[] = [
      {
        type: "code_interpreter",
        container: {
          type: "auto",
          ...(docFileIds.length > 0 && { file_ids: docFileIds }),
        },
      },
    ];

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

    const { error: userMessageError } = await serviceClient.from("messages").insert({
      thread_id: threadId,
      user_id: user.id,
      role: "user",
      content: message.trim(),
      files: incoming.length > 0 ? incoming : null,
    });
    if (userMessageError) throw userMessageError;

    const input = buildUserInput(message, incoming);
    const messageLabel = message.trim() || attachmentLabel(incoming);
    const response = runStreamResponse({
      conversationId,
      model: gpt.model || "gpt-4.1-mini",
      instructions: gpt.system_prompt || "",
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
        if (thread.title === "Nueva conversación") {
          await supabase.from("threads").update({ title: messageLabel.slice(0, 40) }).eq("id", threadId);
        }
        const { error: usageError } = await serviceClient.from("usage_events").insert({
          user_id: user.id,
          gpt_id: gptId,
          thread_id: threadId,
          model: meta.model,
          tokens_in: meta.tokensIn,
          tokens_out: meta.tokensOut,
          cost: estimateCost(meta.model, meta.tokensIn, meta.tokensOut),
        });
        if (usageError) {
          console.error("chat usage log error", {
            code: usageError.code,
            message: usageError.message,
          });
        }
      },
      onSettled: async () => {
        await supabase.rpc("release_thread_lock", { p_thread_id: threadId });
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
    if (!handedToStream) {
      await supabase.rpc("release_thread_lock", { p_thread_id: threadId });
    }
  }
}
