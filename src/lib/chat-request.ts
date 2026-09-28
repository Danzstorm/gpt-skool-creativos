import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { NextResponse } from "next/server";
import type { Tool } from "openai/resources/responses/responses";
import { keepAvailableFiles } from "@/lib/conversation-sync";
import { type IncomingFile } from "@/lib/chat-content";
import { assignThreadNumbers, type ThreadNumbers } from "@/lib/attachment-labels";
import {
  acquireThreadLease,
  releaseThreadLease,
  type ThreadLease,
} from "@/lib/thread-lease";

export type UploadedFileRow = {
  openai_file_id: string;
  mime: string | null;
  name: string | null;
  video_description: string | null;
  created_at?: string | null;
};

/** Tras /upload/register el archivo ya existe en OpenAI; evitar retrieve redundante. */
export const RECENTLY_REGISTERED_MS = 120_000;

export function recentlyRegisteredFileIds(
  rows: Pick<UploadedFileRow, "openai_file_id" | "created_at">[],
  now = Date.now()
): Set<string> {
  return new Set(
    rows.flatMap((row) => {
      if (!row.created_at) return [];
      const age = now - new Date(row.created_at).getTime();
      if (age < 0 || age > RECENTLY_REGISTERED_MS) return [];
      return [row.openai_file_id];
    })
  );
}

/** Etiqueta corta cuando el turno no tiene texto pero sí adjuntos. */
export function messageAttachmentLabel(files: IncomingFile[]): string {
  if (files.length === 1) {
    return files[0].type === "image" ? "Imagen adjunta" : "Archivo adjunto";
  }
  return files.every((file) => file.type === "image")
    ? `${files.length} imágenes adjuntas`
    : `${files.length} archivos adjuntos`;
}

/**
 * Convierte filas de `uploaded_files` en adjuntos tipados. El tipo sale del MIME
 * detectado al registrar el archivo, nunca del cliente.
 */
export function mapUploadedRowsToIncoming(
  fileIds: string[],
  rows: UploadedFileRow[]
): IncomingFile[] {
  const byId = new Map(rows.map((file) => [file.openai_file_id, file]));
  return fileIds.map((id) => {
    const row = byId.get(id);
    const isImage = row?.mime?.startsWith("image/") ?? false;
    const isVideo = row?.mime?.startsWith("video/") ?? false;
    const type = isImage ? "image" : isVideo ? "video" : "document";
    return {
      openai_file_id: id,
      type,
      // El nombre real solo se guarda para documentos y videos: el de una
      // imagen no se manda nunca (ver openaiImageName en upload-file.ts). El
      // video nunca lleva su nombre al modelo (chat-content.ts no lo usa),
      // esto es solo para que la miniatura/chip conserve el nombre real.
      ...(type === "document" || type === "video" ? { name: row?.name ?? null } : {}),
      ...(type === "video" ? { videoDescription: row?.video_description ?? null } : {}),
    } satisfies IncomingFile;
  });
}

export type OwnedAttachmentsError =
  | { kind: "lookup"; cause: unknown }
  | { kind: "not_owned" };

export type OwnedIncomingFilesResult =
  | { ok: true; files: IncomingFile[]; skipOpenAiVerifyIds: Set<string> }
  | { ok: false; error: OwnedAttachmentsError };

/** Resuelve ownership server-side y devuelve adjuntos tipados en el orden pedido. */
export async function loadOwnedIncomingFiles(
  serviceClient: SupabaseClient,
  userId: string,
  fileIds: string[]
): Promise<OwnedIncomingFilesResult> {
  if (fileIds.length === 0) return { ok: true, files: [], skipOpenAiVerifyIds: new Set() };

  const { data: ownedFiles, error: ownedFilesError } = await serviceClient
    .from("uploaded_files")
    .select("openai_file_id, mime, name, video_description, created_at")
    .eq("user_id", userId)
    .in("openai_file_id", fileIds);
  if (ownedFilesError) {
    return { ok: false, error: { kind: "lookup", cause: ownedFilesError } };
  }

  const byId = new Map((ownedFiles ?? []).map((file) => [file.openai_file_id, file]));
  if (byId.size !== fileIds.length) {
    return { ok: false, error: { kind: "not_owned" } };
  }

  const rows = ownedFiles ?? [];
  return {
    ok: true,
    files: mapUploadedRowsToIncoming(fileIds, rows),
    skipOpenAiVerifyIds: recentlyRegisteredFileIds(rows),
  };
}

export const VISION_DISABLED_ERROR = "Este GPT no admite imágenes";

export function visionRejectsImages(visionEnabled: boolean, incoming: IncomingFile[]): boolean {
  return !visionEnabled && incoming.some((file) => file.type === "image");
}

export type OpenAiAttachmentPolicy = "strict" | "filter_unavailable";

export const OPENAI_ATTACHMENT_UNAVAILABLE_ERROR =
  "Uno de los archivos ya no está disponible. Vuelve a subirlo desde el botón de adjuntar.";

/**
 * Comprueba que los adjuntos respaldados por OpenAI sigan existiendo allí.
 * Los videos se excluyen: su openai_file_id es sintético (ver /api/upload/register).
 */
export async function applyOpenAiAttachmentPolicy(
  openai: OpenAI,
  incoming: IncomingFile[],
  policy: OpenAiAttachmentPolicy,
  options?: { skipOpenAiVerifyIds?: ReadonlySet<string> }
): Promise<{ ok: true; files: IncomingFile[] } | { ok: false; error: string }> {
  const openaiBacked = incoming.filter(
    (file) => file.type !== "video" && !file.openai_file_id.startsWith("audio_")
  );
  if (openaiBacked.length === 0) return { ok: true, files: incoming };

  const availableIds = new Set(
    (
      await keepAvailableFiles(openai, openaiBacked, {
        trustIds: options?.skipOpenAiVerifyIds,
      })
    ).map((file) => file.openai_file_id)
  );
  if (policy === "strict" && availableIds.size !== openaiBacked.length) {
    return { ok: false, error: OPENAI_ATTACHMENT_UNAVAILABLE_ERROR };
  }

  return {
    ok: true,
    files: incoming.filter(
      (file) =>
        file.type === "video" ||
        file.openai_file_id.startsWith("audio_") ||
        availableIds.has(file.openai_file_id)
    ),
  };
}

export function buildCodeInterpreterTools(incoming: IncomingFile[]): Tool[] {
  const docFileIds = incoming
    .filter((file) => file.type === "document" && !file.openai_file_id.startsWith("audio_"))
    .map((file) => file.openai_file_id);
  return [
    {
      type: "code_interpreter",
      container: {
        type: "auto",
        ...(docFileIds.length > 0 && { file_ids: docFileIds }),
      },
    },
  ];
}

export async function acquireRouteThreadLease(
  supabase: SupabaseClient,
  threadId: string,
  route: "chat" | "regenerate" | "version"
): Promise<{ ok: true; lease: ThreadLease } | { ok: false; response: NextResponse }> {
  let lease: ThreadLease | null;
  try {
    lease = await acquireThreadLease(supabase, threadId);
  } catch (lockError) {
    console.error(`${route} lock error`, {
      code:
        lockError && typeof lockError === "object" && "code" in lockError
          ? lockError.code
          : undefined,
      message: lockError instanceof Error ? lockError.message : String(lockError),
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "No se pudo iniciar la respuesta" }, { status: 500 }),
    };
  }
  if (!lease) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ya hay una respuesta en curso para esta conversación." },
        { status: 409 }
      ),
    };
  }
  return { ok: true, lease };
}

/** Libera el lease si el stream no llegó a hacerse cargo. */
export async function releaseLeaseIfNotStreamed(
  handedToStream: boolean,
  supabase: SupabaseClient,
  threadId: string,
  lease: ThreadLease
): Promise<void> {
  if (!handedToStream) {
    await releaseThreadLease(supabase, threadId, lease);
  }
}

/**
 * Números de los adjuntos de un hilo, listos para rotular lo que ve el modelo.
 *
 * Solo se leen mensajes con adjuntos: los turnos de solo texto no influyen en
 * la numeración (legacy incluida, que reinicia por mensaje con archivos).
 *
 * Se llama DESPUÉS de guardar el turno del usuario, así sus archivos ya están
 * en la historia y toman los números siguientes sin tratarlos aparte.
 */
export async function threadAttachmentNumbers(
  service: SupabaseClient,
  threadId: string,
  userId: string,
  outgoing: IncomingFile[] = []
): Promise<ThreadNumbers> {
  const { data, error } = await service
    .from("messages")
    .select("files, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .not("files", "is", null)
    .order("created_at", { ascending: true });

  // Sin historia no se puede numerar bien, pero tirar el turno sería peor: el
  // mensaje se manda igual y las imágenes quedan sin rótulo, como antes de que
  // esto existiera.
  if (error) {
    console.error("thread attachment numbers error", { code: error.code, message: error.message });
    return { images: new Map(), videos: new Map() };
  }

  return assignThreadNumbers(data ?? [], outgoing);
}
