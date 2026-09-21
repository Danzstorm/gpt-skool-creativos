import type { UploadedFile } from "./types";
import { MAX_FILES_PER_MESSAGE } from "./upload-file";
import { MAX_SIZE_BYTES, MAX_SIZE_MB, MAX_VIDEO_SIZE_BYTES, MAX_VIDEO_SIZE_MB } from "./upload-limits";

export function maxFilesMessage(maxFiles = MAX_FILES_PER_MESSAGE): string {
  return `Puedes adjuntar hasta ${maxFiles} archivos por mensaje.`;
}

export function skippedFilesMessage(
  skippedCount: number,
  maxFiles = MAX_FILES_PER_MESSAGE
): string {
  return `Se omitieron ${skippedCount} archivos: máximo ${maxFiles} por mensaje.`;
}

export type UploadPlan<T extends { type: string }> =
  | { ok: false; error: string }
  | { ok: true; batch: T[]; skippedCount: number; uploadingVideo: boolean };

/**
 * Decide qué archivos entran en esta subida y qué aviso mostrar, sin I/O.
 *
 * El tope vive acá porque el hook solo orquesta la subida: si estas reglas
 * se reescribieran junto al fetch, un test tendría que mockear Storage para
 * comprobar un slice y un mensaje. Las subidas en vuelo no bloquean otra
 * tanda: reservan cupo para no mandar 20 archivos a Storage y recortar
 * después.
 */
export function planUploadBatch<T extends { type: string }>(input: {
  files: T[];
  attachedCount: number;
  pendingUploads: number;
  maxFiles?: number;
}): UploadPlan<T> {
  const maxFiles = input.maxFiles ?? MAX_FILES_PER_MESSAGE;
  const remaining = maxFiles - input.attachedCount - input.pendingUploads;
  if (remaining <= 0) {
    return { ok: false, error: maxFilesMessage(maxFiles) };
  }

  const batch = input.files.slice(0, remaining);
  return {
    ok: true,
    batch,
    skippedCount: input.files.length - batch.length,
    uploadingVideo: batch.some((file) => file.type.startsWith("video/")),
  };
}

/**
 * Motivo de rechazo por tamaño en el cliente. No usa `rejectReason`: el
 * navegador solo corta por peso; tipo y video-enabled los decide el servidor
 * al firmar, para no desfasar el mensaje de error respecto de /upload/sign.
 */
export function fileSizeRejectReason(file: { type: string; size: number }): string | null {
  const isVideo = file.type.startsWith("video/");
  const cap = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_SIZE_BYTES;
  const mb = isVideo ? MAX_VIDEO_SIZE_MB : MAX_SIZE_MB;
  if (file.size > cap) return `supera el límite de ${mb}MB`;
  return null;
}

export function namedUploadError(name: string, message: string): string {
  return `${name}: ${message}`;
}

export function composeUploadError(parts: string[]): string | null {
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type LibraryAttachment = Pick<
  UploadedFile,
  "name" | "openai_file_id" | "type" | "previewUrl"
>;

export type LibraryAttachDecision =
  | { next: UploadedFile[]; error?: undefined }
  | { next: UploadedFile[]; error: string };

/**
 * Reusa un archivo de la biblioteca sin subirlo. Duplicado se ignora; el tope
 * es el mismo que al adjuntar nuevos, porque si no el rechazo llegaba del
 * servidor después de que el composer ya había vaciado los adjuntos.
 */
export function decideLibraryAttach(
  current: UploadedFile[],
  file: LibraryAttachment,
  maxFiles = MAX_FILES_PER_MESSAGE
): LibraryAttachDecision {
  if (current.some((attached) => attached.openai_file_id === file.openai_file_id)) {
    return { next: current };
  }
  if (current.length >= maxFiles) {
    return { next: current, error: maxFilesMessage(maxFiles) };
  }
  return {
    next: [
      ...current,
      {
        name: file.name,
        openai_file_id: file.openai_file_id,
        type: file.type,
        previewUrl: file.previewUrl,
      },
    ],
  };
}

/**
 * Algunas imágenes llegan a register sin MIME en el Blob (p. ej. recorte).
 * El preview tiene que heredar el MIME que devolvió el servidor; si no,
 * `URL.createObjectURL` arma un blob opaco y la miniatura no pinta.
 */
export function attachmentPreviewBlob(file: Blob, kind: string, mime?: string): Blob {
  if (kind === "image" && !file.type && mime) {
    return new Blob([file], { type: mime });
  }
  return file;
}

export type CommitUploadResult = {
  next: UploadedFile[];
  /** Entran al estado: cabían y no estaban ya. */
  accepted: UploadedFile[];
  /** Subidos bien, pero el tope ya estaba ocupado al commitear. */
  overflow: UploadedFile[];
  /** Mismo file_id que algo que ya está; se ignoran como en la biblioteca. */
  duplicates: UploadedFile[];
};

/**
 * Fuente de verdad del tope al cerrar una subida.
 *
 * `planUploadBatch` mira el cupo al empezar. Mientras el lote vuela,
 * `attachFromLibrary` puede llenar huecos. Concatenar a ciegas
 * (`[...prev, ...ok]`) entonces supera MAX_FILES_PER_MESSAGE. Acá se
 * vuelve a cortar contra el estado actual: lo de biblioteca que ya
 * está se conserva; lo que no cabe se devuelve en `overflow` para
 * avisar y revocar el object URL.
 */
export function commitUploadResults(
  current: UploadedFile[],
  incoming: UploadedFile[],
  maxFiles = MAX_FILES_PER_MESSAGE
): CommitUploadResult {
  const seen = new Set(current.map((file) => file.openai_file_id));
  const accepted: UploadedFile[] = [];
  const overflow: UploadedFile[] = [];
  const duplicates: UploadedFile[] = [];

  for (const file of incoming) {
    if (seen.has(file.openai_file_id)) {
      duplicates.push(file);
      continue;
    }
    if (current.length + accepted.length >= maxFiles) {
      overflow.push(file);
      continue;
    }
    seen.add(file.openai_file_id);
    accepted.push(file);
  }

  return {
    next: [...current, ...accepted],
    accepted,
    overflow,
    duplicates,
  };
}

/** Sustituye el placeholder del tile sin cambiar `clientId` ni el blob local. */
export function applyUploadToTray(
  current: UploadedFile[],
  clientId: string,
  uploaded: UploadedFile
): UploadedFile[] {
  return current.map((file) =>
    file.clientId === clientId
      ? {
          ...uploaded,
          clientId,
          previewUrl: file.previewUrl ?? uploaded.previewUrl,
          mediaUrl: file.mediaUrl ?? uploaded.mediaUrl,
          pending: false,
        }
      : file
  );
}

export function isLocalOnlyUpload(file: UploadedFile): boolean {
  const id = file.openai_file_id;
  return file.pending === true || !id || id.startsWith("pending_") || id.startsWith("local_");
}

/** Lo que viaja a /api/chat. El audio sintético se queda en la UI. */
export function toChatRequestFile(
  file: UploadedFile
): { openai_file_id: string; type: "image" | "document" | "video" } | null {
  if (isLocalOnlyUpload(file)) return null;
  if (file.type === "audio") {
    if (file.openai_file_id.startsWith("audio_")) return null;
    return { openai_file_id: file.openai_file_id, type: "document" };
  }
  return { openai_file_id: file.openai_file_id, type: file.type };
}
