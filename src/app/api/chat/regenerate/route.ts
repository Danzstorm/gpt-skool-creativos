import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";
import { runStreamResponse } from "@/lib/chat-stream";
import { buildUserInput, type IncomingFile } from "@/lib/chat-content";
import { estimateCost } from "@/lib/pricing";
import { getGptRuntimeConfig } from "@/lib/gpt-runtime-config";
import {
  ensureThreadConversation,
  keepAvailableFiles,
  needsConversationCheck,
} from "@/lib/conversation-sync";
import {
  acquireThreadLease,
  releaseThreadLease,
  type ThreadLease,
} from "@/lib/thread-lease";
import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";

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
      .select("system_prompt, model")
      .eq("id", gptId)
      .eq("is_active", true)
      .single(),
    supabase
      .from("threads")
      .select("openai_conversation_id, conversation_key_fingerprint")
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
  const gpt = await getGptRuntimeConfig(serviceClient, gptId, gptRes.data);
  const storedConversationId = threadRes.data.openai_conversation_id;
  // Thread heredado de otra API key: su Conversation y sus adjuntos pueden vivir
  // en un proyecto de OpenAI que esta cuenta no ve (ver conversation-sync.ts).
  const isLegacyThread = needsConversationCheck(
    threadRes.data.conversation_key_fingerprint
  );

  let lease: ThreadLease | null;
  try {
    lease = await acquireThreadLease(supabase, threadId);
  } catch (lockError) {
    console.error("regenerate lock error", {
      code:
        lockError && typeof lockError === "object" && "code" in lockError
          ? lockError.code
          : undefined,
      message: lockError instanceof Error ? lockError.message : String(lockError),
    });
    return NextResponse.json({ error: "No se pudo iniciar la respuesta" }, { status: 500 });
  }
  if (!lease) {
    return NextResponse.json(
      { error: "Ya hay una respuesta en curso para esta conversación." },
      { status: 409 }
    );
  }

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
      const { data: ownedFiles, error: ownedFilesError } = await serviceClient
        .from("uploaded_files")
        .select("openai_file_id, mime")
        .eq("user_id", user.id)
        .in("openai_file_id", fileIds);
      if (ownedFilesError) throw ownedFilesError;
      const byId = new Map((ownedFiles ?? []).map((file) => [file.openai_file_id, file]));
      if (byId.size !== fileIds.length) {
        return NextResponse.json(
          { error: "Uno de los adjuntos ya no está disponible para regenerar" },
          { status: 400 }
        );
      }
      incoming = fileIds.map((id) => ({
        openai_file_id: id,
        type: byId.get(id)?.mime?.startsWith("image/") ? "image" : "document",
      }));
      if (isLegacyThread) {
        // Reenviar un file_id de la cuenta anterior tumba la regeneración
        // entera con "No such File object". Se omite el adjunto perdido: el
        // usuario sigue viendo su miniatura (sale de Storage) y el turno corre.
        incoming = await keepAvailableFiles(openai, incoming);
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
    const input = buildUserInput(lastUserMessage.content, incoming);
    const response = runStreamResponse({
      conversationId,
      model: gpt.model || "gpt-4.1-mini",
      instructions: gpt.system_prompt || "",
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
    if (!handedToStream) {
      await releaseThreadLease(supabase, threadId, lease);
    }
  }
}
