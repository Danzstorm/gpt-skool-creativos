import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncomingFile } from "@/lib/chat-content";
import {
  imageLabel,
  imageNumber,
  videoLabel,
  videoNumber,
  type AttachmentLike,
} from "@/lib/attachment-labels";

const SCHEMA_RETRY_MS = 60_000;
let unavailableUntil = 0;

/**
 * Junta los `openai_file_id` únicos de `messages.files` (el read model real,
 * ver recordMessageAttachments más abajo) para un conjunto de mensajes.
 *
 * Usado por /api/files para acotar la biblioteca del `@` al hilo actual, en
 * vez de a todo lo que el usuario subió alguna vez en cualquier chat.
 */
export function threadFileIds(messages: { files: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const { files } of messages) {
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (f && typeof f === "object" && typeof (f as { openai_file_id?: unknown }).openai_file_id === "string") {
        ids.add((f as { openai_file_id: string }).openai_file_id);
      }
    }
  }
  return [...ids];
}

type StoredFile = { openai_file_id?: unknown; type?: unknown };

/** El `type` guardado en messages.files, saneado. Lo desconocido cae a documento. */
function storedType(file: unknown): AttachmentLike["type"] {
  const t = (file as StoredFile)?.type;
  return t === "image" || t === "video" ? t : "document";
}

/**
 * Cómo se llama cada archivo del hilo **para el modelo**: "imagen 2",
 * "descripción de video 1".
 *
 * El menú `@` mostraba el nombre del dispositivo (`IMG_2039.jpg`), que es justo
 * el nombre que openaiImageName se encarga de que el modelo NUNCA vea. Así el
 * usuario leía un vocabulario y el modelo otro: pedir "usá IMG_2039" no podía
 * funcionar, porque para el modelo esa imagen es "Imagen 2". Las burbujas del
 * composer ya rotulaban bien; el menú era la última superficie sin alinear.
 *
 * La numeración es POR MENSAJE, igual que la que recibe el modelo — no se
 * renumera por hilo, porque inventar un número que el modelo nunca vio sería
 * volver a desincronizar los dos vocabularios, solo que al revés. Por eso dos
 * archivos de mensajes distintos pueden ser los dos "imagen 1": en el menú los
 * distinguen la miniatura y la fecha, que es como se los reconoce de verdad.
 *
 * Los DOCUMENTOS quedan fuera a propósito: ahí el nombre real sí es información
 * y es lo que el modelo recibe como `filename`.
 *
 * Con los mensajes ordenados del más viejo al más nuevo, un archivo re-adjuntado
 * conserva el rótulo de la primera vez que se mandó, que es su identidad estable.
 */
export function threadAttachmentLabels(messages: { files: unknown }[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const { files } of messages) {
    if (!Array.isArray(files)) continue;
    const typed: AttachmentLike[] = files.map((f) => ({ type: storedType(f) }));

    files.forEach((file, index) => {
      const id = (file as StoredFile)?.openai_file_id;
      if (typeof id !== "string" || labels.has(id)) return;

      const image = imageNumber(typed, index);
      if (image !== null) {
        labels.set(id, imageLabel(image));
        return;
      }

      const video = videoNumber(typed, index);
      if (video !== null) labels.set(id, videoLabel(video));
    });
  }

  return labels;
}

/**
 * Compatibility dual-write for the normalized attachment relationship.
 * `messages.files` remains the read model during phase 1, so a failure here is
 * observable but must not discard a user turn that was already persisted.
 */
export async function recordMessageAttachments(
  service: SupabaseClient,
  messageId: string,
  files: IncomingFile[]
): Promise<void> {
  if (files.length === 0) return;

  // Marca de ciclo de vida: este archivo llegó a mandarse, así que pasa a ser
  // biblioteca del usuario y la limpieza ya no lo puede recolectar. Va antes
  // del dual-write y fuera de su circuit breaker porque protege de un borrado
  // irreversible en tres sistemas, mientras que message_attachments es todavía
  // una tabla sombra que nadie lee.
  //
  // Solo la primera vez (filtro attached_at is null): re-adjuntar un archivo
  // viejo desde la biblioteca no debe reescribir su fecha original.
  const { error: attachError } = await service
    .from("uploaded_files")
    .update({ attached_at: new Date().toISOString() })
    .in(
      "openai_file_id",
      files.map((file) => file.openai_file_id)
    )
    .is("attached_at", null);

  if (attachError) {
    console.error("uploaded_files attached_at error", {
      messageId,
      code: attachError.code,
      message: attachError.message,
    });
  }

  if (Date.now() < unavailableUntil) return;

  const { error } = await service.from("message_attachments").insert(
    files.map((file, position) => ({
      message_id: messageId,
      openai_file_id: file.openai_file_id,
      position,
      kind: file.type,
    }))
  );

  if (error?.code === "PGRST205" || error?.code === "42P01") {
    unavailableUntil = Date.now() + SCHEMA_RETRY_MS;
    return;
  }

  if (error) {
    console.error("message attachment relation error", {
      messageId,
      code: error.code,
      message: error.message,
    });
    return;
  }

  unavailableUntil = 0;
}
