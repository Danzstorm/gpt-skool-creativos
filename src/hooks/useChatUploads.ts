import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { UploadedFile } from "@/lib/types";
import { downscaleImage } from "@/lib/image-resize";
import { createClient } from "@/lib/supabase/client";
import {
  applyUploadToTray,
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
import { videoDurationRejectReason } from "@/lib/video-copy";
import { probeBrowserVideoPreview } from "@/lib/video-duration";

// Solo se usa para subir adjuntos a Storage con URL firmada; el resto de los
// datos del chat viaja por las rutas de /api.
const supabase = createClient();

export function useChatUploads(canAttach: boolean) {
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  // Video en vuelo hacia Storage/register. El análisis Gemini va aparte
  // (attachedFiles[].analyzing) para no bloquear el attach.
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Refs: dos tandas pueden arrancar antes del re-render. El plan reserva
  // cupo contra estos números, no contra el state que todavía no pintó.
  const pendingRef = useRef(0);
  const videoPendingRef = useRef(0);
  const attachedCountRef = useRef(0);
  useEffect(() => {
    attachedCountRef.current = attachedFiles.length;
  }, [attachedFiles.length]);

  const dismissUploadError = useCallback(() => setUploadError(null), []);
  const clearAttachments = useCallback(() => setAttachedFiles([]), []);
  const restoreAttachments = useCallback((files: UploadedFile[] | undefined) => {
    setAttachedFiles(files ? [...files] : []);
  }, []);

  const analyzeByIdRef = useRef(new Map<string, Promise<boolean>>());
  const markVideoAnalyzing = useCallback((fileId: string, analyzing: boolean) => {
    setAttachedFiles((prev) =>
      prev.map((file) => (file.openai_file_id === fileId ? { ...file, analyzing } : file))
    );
  }, []);

  const startVideoAnalyze = useCallback(
    (fileId: string) => {
      const existing = analyzeByIdRef.current.get(fileId);
      if (existing) return existing;
      const pending = (async () => {
        try {
          const res = await fetch("/api/upload/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: fileId }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            setUploadError(
              typeof data?.error === "string" ? data.error : "No se pudo analizar el video"
            );
            markVideoAnalyzing(fileId, false);
            return false;
          }
          markVideoAnalyzing(fileId, false);
          return true;
        } catch {
          setUploadError("No se pudo analizar el video");
          markVideoAnalyzing(fileId, false);
          return false;
        } finally {
          analyzeByIdRef.current.delete(fileId);
        }
      })();
      analyzeByIdRef.current.set(fileId, pending);
      return pending;
    },
    [markVideoAnalyzing]
  );

  const waitForVideoAnalysis = useCallback(async () => {
    const pending = [...analyzeByIdRef.current.values()];
    if (pending.length === 0) return true;
    const results = await Promise.all(pending);
    return results.every(Boolean);
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploadError(null);
    const plan = planUploadBatch({
      files,
      attachedCount: attachedCountRef.current,
      pendingUploads: pendingRef.current,
    });
    if (!plan.ok) {
      setUploadError(plan.error);
      return;
    }

    const staged = plan.batch.map((original) => {
      const clientId = crypto.randomUUID();
      const isImage = original.type.startsWith("image/");
      const isAudio = original.type.startsWith("audio/");
      const previewUrl = isImage || isAudio ? URL.createObjectURL(original) : undefined;
      return { original, clientId, isImage, isAudio, previewUrl };
    });

    const placeholders: UploadedFile[] = staged
      .filter((item) => item.isImage || item.isAudio)
      .map((item) => ({
        clientId: item.clientId,
        name: item.original.name,
        openai_file_id: `pending_${item.clientId}`,
        type: item.isImage ? "image" : "audio",
        previewUrl: item.isImage ? item.previewUrl : undefined,
        mediaUrl: item.isAudio ? item.previewUrl : undefined,
        pending: true,
      }));
    if (placeholders.length > 0) {
      attachedCountRef.current += placeholders.length;
      setAttachedFiles((prev) => [...prev, ...placeholders]);
    }

    const reserved = staged.length - placeholders.length;
    const videoCount = plan.batch.filter((file) => file.type.startsWith("video/")).length;
    pendingRef.current += reserved;
    videoPendingRef.current += videoCount;
    setPendingUploads(pendingRef.current);
    setUploadingVideo(videoPendingRef.current > 0);

    // En paralelo dentro del lote; otra tanda puede sumarse sin esperar.
    const results = await Promise.all(
      staged.map(async ({ original, clientId, isImage, isAudio, previewUrl }) => {
        const fail = (msg: string, posterUrl?: string) => {
          if (posterUrl && posterUrl !== previewUrl) URL.revokeObjectURL(posterUrl);
          return { error: namedUploadError(original.name, msg), clientId, isAudio, isImage, previewUrl };
        };
        let posterUrl: string | undefined;
        let durationSeconds: number | undefined;
        try {
          const sizeReason = fileSizeRejectReason(original);
          if (sizeReason) return fail(sizeReason);
          if (original.type.startsWith("video/")) {
            const preview = await probeBrowserVideoPreview(original);
            posterUrl = preview.posterUrl;
            if (preview.durationSeconds != null) durationSeconds = preview.durationSeconds;
            const durationReason = videoDurationRejectReason(preview.durationSeconds);
            if (durationReason) return fail(durationReason, posterUrl);
          }
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
            return fail((await signRes.json().catch(() => null))?.error ?? "no se pudo subir", posterUrl);
          }
          const { path, token } = await signRes.json();

          const { error: upErr } = await supabase.storage
            .from("chat-uploads")
            .uploadToSignedUrl(path, token, file);
          if (upErr) return fail("falló la subida, revisa tu conexión", posterUrl);

          const regRes = await fetch("/api/upload/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, name: file.name, type: file.type }),
          });
          if (!regRes.ok) {
            return fail((await regRes.json().catch(() => null))?.error ?? "no se pudo procesar", posterUrl);
          }

          const data = await regRes.json();
          const kind = (isAudio ? "audio" : data.kind) as UploadedFile["type"];
          const uploadedAsImage = kind === "image" && !previewUrl;
          const previewBlob = attachmentPreviewBlob(file, kind, data.mime);
          const analyzing = kind === "video" && data.analyzing === true;
          if (analyzing && typeof data.file_id === "string") {
            void startVideoAnalyze(data.file_id);
          }
          return {
            file: {
              clientId,
              name: original.name,
              openai_file_id: data.file_id,
              type: kind,
              previewUrl: isImage
                ? previewUrl
                : uploadedAsImage
                  ? URL.createObjectURL(previewBlob)
                  : posterUrl,
              ...(kind === "video" ? { mediaUrl: URL.createObjectURL(file) } : {}),
              ...(isAudio ? { mediaUrl: previewUrl } : {}),
              ...(durationSeconds != null ? { durationSeconds } : {}),
              ...(analyzing ? { analyzing: true } : {}),
            },
          };
        } catch {
          return fail("no se pudo subir", posterUrl);
        }
      })
    );

    pendingRef.current = Math.max(0, pendingRef.current - reserved);
    videoPendingRef.current = Math.max(0, videoPendingRef.current - videoCount);
    setPendingUploads(pendingRef.current);
    setUploadingVideo(videoPendingRef.current > 0);

    const ok = results.flatMap((r) => ("file" in r && r.file ? [r.file] : []));
    const failed = results.flatMap((r) => ("error" in r && r.error ? [r] : []));
    // El cupo se decide contra `prev`, no contra el conteo de cuando arrancó
    // el lote: attachFromLibrary puede haber llenado huecos durante el await.
    let overflowCount = 0;
    if (ok.length > 0 || failed.length > 0) {
      let released: UploadedFile[] = [];
      setAttachedFiles((prev) => {
        let next = prev;
        for (const result of failed) {
          if (!("clientId" in result) || !result.clientId) continue;
          if (result.isAudio) {
            next = next.map((file) =>
              file.clientId === result.clientId
                ? { ...file, openai_file_id: `local_${result.clientId}`, pending: false }
                : file
            );
            continue;
          }
          if (result.isImage) {
            const victim = next.find((file) => file.clientId === result.clientId);
            if (victim) released.push(victim);
            next = next.filter((file) => file.clientId !== result.clientId);
          }
        }
        const stagedOk = ok.filter((file) => file.clientId && next.some((row) => row.clientId === file.clientId));
        const freshOk = ok.filter((file) => !stagedOk.includes(file));
        for (const file of stagedOk) {
          if (file.clientId) next = applyUploadToTray(next, file.clientId, file);
        }
        if (freshOk.length > 0) {
          const commit = commitUploadResults(next, freshOk);
          overflowCount = commit.overflow.length;
          released = [...released, ...commit.overflow, ...commit.duplicates];
          return commit.next;
        }
        return next;
      });
      for (const file of released) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
        if (file.mediaUrl) URL.revokeObjectURL(file.mediaUrl);
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
  }, [startVideoAnalyze]);

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
      if (f?.mediaUrl) URL.revokeObjectURL(f.mediaUrl);
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
    waitForVideoAnalysis,
    attachFromLibrary,
    removeAttached,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
