import { MAX_FILES_PER_MESSAGE } from "@/lib/upload-file";

export const CHAT_MESSAGE_MAX_LENGTH = 20_000;

export type ParseBodyFailure = { ok: false; status: 400; error: string };

export type ParsedChatTurnBody = {
  gptId: string;
  threadId: string;
  message: string;
  replaceLast: boolean;
  requestedIds: string[];
};

export type ParsedRegenerateBody = { gptId: string; threadId: string };

function requestedIdsFromFiles(files: unknown): { ok: true; ids: string[] } | { ok: false } {
  const rawFiles = Array.isArray(files) ? files : [];
  const requestedIds = rawFiles.flatMap((file) =>
    file &&
    typeof file === "object" &&
    "openai_file_id" in file &&
    typeof file.openai_file_id === "string"
      ? [file.openai_file_id]
      : []
  );
  if (requestedIds.length !== rawFiles.length || new Set(requestedIds).size !== requestedIds.length) {
    return { ok: false };
  }
  return { ok: true, ids: requestedIds };
}

export function parseChatTurnBody(
  body: unknown
): ({ ok: true } & ParsedChatTurnBody) | ParseBodyFailure {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Faltan parámetros" };
  }
  const { gptId, threadId, message, files, replaceLast } = body as {
    gptId?: unknown;
    threadId?: unknown;
    message?: unknown;
    files?: unknown;
    replaceLast?: unknown;
  };
  if (
    typeof gptId !== "string" ||
    typeof threadId !== "string" ||
    typeof message !== "string" ||
    !gptId ||
    !threadId
  ) {
    return { ok: false, status: 400, error: "Faltan parámetros" };
  }
  if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
    return { ok: false, status: 400, error: "El mensaje es demasiado largo" };
  }

  const rawFiles = Array.isArray(files) ? files : [];
  if (rawFiles.length > MAX_FILES_PER_MESSAGE) {
    return {
      ok: false,
      status: 400,
      error: `Puedes adjuntar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`,
    };
  }
  const parsedIds = requestedIdsFromFiles(files);
  if (!parsedIds.ok) {
    return { ok: false, status: 400, error: "Adjuntos inválidos" };
  }
  if (!message.trim() && parsedIds.ids.length === 0) {
    return { ok: false, status: 400, error: "El mensaje está vacío" };
  }

  return {
    ok: true,
    gptId,
    threadId,
    message,
    replaceLast: replaceLast === true,
    requestedIds: parsedIds.ids,
  };
}

export function parseRegenerateBody(
  body: unknown
): ({ ok: true } & ParsedRegenerateBody) | ParseBodyFailure {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Faltan parámetros" };
  }
  const { gptId, threadId } = body as { gptId?: unknown; threadId?: unknown };
  if (typeof gptId !== "string" || typeof threadId !== "string" || !gptId || !threadId) {
    return { ok: false, status: 400, error: "Faltan parámetros" };
  }
  return { ok: true, gptId, threadId };
}
