import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GEMINI_MODEL,
  describeVideo,
  estimateGeminiCost,
  uploadVideo,
  worstCaseVideoCost,
} from "@/lib/gemini-upload";
import type { IncomingFile } from "@/lib/chat-content";

export type AnalyzeVideoResult =
  | { ok: true; description: string; alreadyReady: boolean }
  | { ok: false; error: string; status: number };

/**
 * Corre Gemini sobre un video ya registrado. Idempotente: si ya hay
 * `video_description`, no vuelve a gastar. El register solo crea la fila;
 * este es el trabajo lento.
 */
export async function analyzeOwnedVideo(
  service: SupabaseClient,
  userId: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<AnalyzeVideoResult> {
  const { data: row, error: rowError } = await service
    .from("uploaded_files")
    .select("openai_file_id, storage_path, mime, name, video_description")
    .eq("user_id", userId)
    .eq("openai_file_id", fileId)
    .maybeSingle();
  if (rowError) {
    return { ok: false, error: "No se pudo leer el video", status: 500 };
  }
  if (!row) {
    return { ok: false, error: "No se encontró el video", status: 404 };
  }
  if (!row.mime?.startsWith("video/")) {
    return { ok: false, error: "Ese archivo no es un video", status: 400 };
  }
  const ready = row.video_description?.trim();
  if (ready) {
    return { ok: true, description: ready, alreadyReady: true };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return { ok: false, error: "El análisis de video no está disponible todavía", status: 503 };
  }

  const { data: blob, error: blobError } = await service.storage.from("chat-uploads").download(row.storage_path);
  if (blobError || !blob) {
    return { ok: false, error: "No se encontró el archivo subido", status: 404 };
  }

  const { data: reservation, error: reservationError } = await service
    .from("usage_events")
    .insert({
      user_id: userId,
      gpt_id: null,
      thread_id: null,
      model: GEMINI_MODEL,
      tokens_in: null,
      tokens_out: null,
      cost: worstCaseVideoCost(),
    })
    .select("id")
    .single();
  if (reservationError || !reservation) {
    return { ok: false, error: "No se pudo iniciar el análisis del video", status: 503 };
  }

  const releaseReservation = async () => {
    const { error } = await service.from("usage_events").delete().eq("id", reservation.id);
    if (error) {
      console.error("video-analyze reservation release failed", {
        id: reservation.id,
        code: error.code,
        message: error.message,
      });
    }
  };

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { fileUri, mimeType } = await uploadVideo(fetchFn, geminiKey, {
      bytes,
      mimeType: row.mime,
      displayName: row.name ?? fileId,
    });
    const { text: description, tokensIn, tokensOut } = await describeVideo(fetchFn, geminiKey, {
      fileUri,
      mimeType,
    });
    const trimmed = description.trim();
    if (!trimmed) throw new Error("Gemini no devolvió una descripción del video");

    await service
      .from("usage_events")
      .update({ tokens_in: tokensIn, tokens_out: tokensOut, cost: estimateGeminiCost(tokensIn, tokensOut) })
      .eq("id", reservation.id);

    const { error: updateError } = await service
      .from("uploaded_files")
      .update({ video_description: trimmed })
      .eq("openai_file_id", fileId)
      .eq("user_id", userId);
    if (updateError) {
      console.error("video-analyze mapping error", { code: updateError.code, message: updateError.message });
      return { ok: false, error: "No se pudo guardar el análisis del video", status: 500 };
    }

    return { ok: true, description: trimmed, alreadyReady: false };
  } catch (videoError) {
    await releaseReservation();
    return {
      ok: false,
      error:
        videoError instanceof Error
          ? `No se pudo analizar el video: ${videoError.message}`
          : "No se pudo analizar el video",
      status: 422,
    };
  }
}

export type FillVideoResult =
  | { ok: true; files: IncomingFile[] }
  | { ok: false; error: string; status: number };

/** Antes de armar el prompt: si un video aún no tiene texto, lo genera ahora. */
export async function fillMissingVideoDescriptions(
  service: SupabaseClient,
  userId: string,
  files: IncomingFile[],
  fetchFn: typeof fetch = fetch
): Promise<FillVideoResult> {
  const pending = files.filter((file) => file.type === "video" && !file.videoDescription?.trim());
  if (pending.length === 0) return { ok: true, files };

  const results = await Promise.all(
    pending.map((file) => analyzeOwnedVideo(service, userId, file.openai_file_id, fetchFn))
  );
  const failed = results.find((result): result is Extract<AnalyzeVideoResult, { ok: false }> => !result.ok);
  if (failed) {
    return { ok: false, error: failed.error, status: failed.status };
  }

  const byId = new Map(pending.map((file, i) => [file.openai_file_id, results[i]]));
  return {
    ok: true,
    files: files.map((file) => {
      const result = byId.get(file.openai_file_id);
      if (!result || !result.ok) return file;
      return { ...file, videoDescription: result.description };
    }),
  };
}
