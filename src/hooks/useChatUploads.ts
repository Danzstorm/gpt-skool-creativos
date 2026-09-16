import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import type { UploadedFile } from "@/lib/types";
import { downscaleImage } from "@/lib/image-resize";
import { createClient } from "@/lib/supabase/client";
import {
  attachmentPreviewBlob,
  commitUploadResults,
  composeUploadError,
  decideLibraryAttach,
  fileSizeRejectReason,
  namedUploadError,
  planUploadBatch,
  skippedFilesMessage,
  type LibraryAttachment,
} from "@/lib/chat-uploads";

// Solo se usa para subir adjuntos a Storage con URL firmada; el resto de los
// datos del chat viaja por las rutas de /api.
const supabase = createClient();

export function useChatUploads(canAttach: boolean) {
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  // Solo para el placeholder del composer ("Analizando video..."): el análisis
  // con Gemini tarda bastante más que subir una imagen o un documento.
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dismissUploadError = useCallback(() => setUploadError(null), []);
  const clearAttachments = useCallback(() => setAttachedFiles([]), []);
  const restoreAttachments = useCallback((files: UploadedFile[] | undefined) => {
    setAttachedFiles(files ? [...files] : []);
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploadError(null);
    const plan = planUploadBatch({
      files,
      attachedCount: attachedFiles.length,
      pendingUploads,
    });
    if (!plan.ok) {
      setUploadError(plan.error);
      return;
    }

    setPendingUploads(plan.batch.length);
    setUploadingVideo(plan.uploadingVideo);

    // En paralelo: antes iban de a uno y adjuntar 3 imágenes tardaba el triple.
    const results = await Promise.all(
      plan.batch.map(async (original) => {
        const fail = (msg: string) => ({ error: namedUploadError(original.name, msg) });
        try {
          const sizeReason = fileSizeRejectReason(original);
          if (sizeReason) return fail(sizeReason);
          // Las imágenes se achican igual: no por el límite (ya no aplica) sino
          // porque subir 8MB de foto no mejora la respuesta y se siente lento.
          const file = await downscaleImage(original);

          // Subida en dos pasos para saltar el techo de 4.5MB que Vercel impone
          // al body de sus funciones: el archivo va del navegador directo a
          // Supabase Storage, y el servidor solo lo copia a OpenAI después.
          const signRes = await fetch("/api/upload/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
          });
          if (!signRes.ok) {
            return fail((await signRes.json().catch(() => null))?.error ?? "no se pudo subir");
          }
          const { path, token } = await signRes.json();

          const { error: upErr } = await supabase.storage
            .from("chat-uploads")
            .uploadToSignedUrl(path, token, file);
          if (upErr) return fail("falló la subida, revisa tu conexión");

          const regRes = await fetch("/api/upload/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, name: file.name, type: file.type }),
          });
          if (!regRes.ok) {
            return fail((await regRes.json().catch(() => null))?.error ?? "no se pudo procesar");
          }

          const data = await regRes.json();
          const kind = data.kind as UploadedFile["type"];
          const uploadedAsImage = kind === "image";
          const previewBlob = attachmentPreviewBlob(file, kind, data.mime);
          return {
            file: {
              name: original.name,
              openai_file_id: data.file_id,
              type: kind,
              previewUrl: uploadedAsImage ? URL.createObjectURL(previewBlob) : undefined,
            },
          };
        } catch {
          return fail("no se pudo subir");
        }
      })
    );

    setPendingUploads(0);
    setUploadingVideo(false);

    const ok = results.flatMap((r) => ("file" in r && r.file ? [r.file] : []));
    // El cupo se decide contra `prev`, no contra el conteo de cuando arrancó
    // el lote: attachFromLibrary puede haber llenado huecos durante el await.
    let overflowCount = 0;
    if (ok.length > 0) {
      let released: UploadedFile[] = [];
      setAttachedFiles((prev) => {
        const commit = commitUploadResults(prev, ok);
        overflowCount = commit.overflow.length;
        released = [...commit.overflow, ...commit.duplicates];
        return commit.next;
      });
      for (const file of released) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
    }

    // Antes los fallos se descartaban en silencio y el archivo simplemente no
    // aparecía, sin ninguna pista de por qué.
    const error = composeUploadError([
      ...(plan.skippedCount + overflowCount > 0
        ? [skippedFilesMessage(plan.skippedCount + overflowCount)]
        : []),
      ...results.flatMap((r) => ("error" in r && r.error ? [r.error] : [])),
    ]);
    if (error) setUploadError(error);
  }, [attachedFiles.length, pendingUploads]);

  /**
   * Adjunta un archivo que ya vive en la biblioteca del usuario.
   *
   * No sube nada: reusa el `openai_file_id` que ya existe, que es el punto
   * entero de la función. Se ignora si ya está adjunto para que elegirlo dos
   * veces no lo duplique.
   */
  const attachFromLibrary = useCallback((file: LibraryAttachment) => {
    setUploadError(null);
    setAttachedFiles((prev) => {
      const decision = decideLibraryAttach(prev, file);
      if (decision.error) setUploadError(decision.error);
      return decision.next;
    });
  }, []);

  const removeAttached = useCallback((index: number) => {
    setAttachedFiles((prev) => {
      const f = prev[index];
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((_, idx) => idx !== index);
    });
  }, []);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      // preventDefault siempre: si no, sin GPT activo el navegador abre el
      // archivo soltado en vez de ignorarlo.
      e.preventDefault();
      // Arrastrar un chat del sidebar también dispara esto; sin el filtro,
      // mover una conversación encendía el overlay de "soltá tus archivos".
      if (canAttach && e.dataTransfer.types.includes("Files")) setIsDragging(true);
    },
    [canAttach]
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (!canAttach) return;
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) void uploadFiles(dropped);
    },
    [canAttach, uploadFiles]
  );

  return {
    attachedFiles,
    pendingUploads,
    uploadingVideo,
    uploadError,
    isDragging,
    dismissUploadError,
    clearAttachments,
    restoreAttachments,
    uploadFiles,
    attachFromLibrary,
    removeAttached,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
