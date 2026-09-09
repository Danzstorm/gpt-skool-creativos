import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rejectReason } from "@/lib/upload-limits";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { detectSupportedImageMime, normalizeUploadFileName, openaiImageName } from "@/lib/upload-file";
import { GEMINI_MODEL, describeVideo, estimateGeminiCost, uploadVideo, worstCaseVideoCost } from "@/lib/gemini-upload";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Deriva el `kind` que ve el cliente a partir del MIME real registrado. */
function kindFromMime(mime: string | null | undefined): "image" | "document" | "video" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  return "document";
}

// Descargar de Storage y volver a subir a OpenAI toma su tiempo con archivos
// grandes; el default de Vercel se queda corto. 300s = techo de Vercel Pro.
export const maxDuration = 300;

// Paso 2 de 2 de la subida de adjuntos (ver /api/upload/sign).
//
// El archivo ya está en Storage, subido por el navegador. Acá se copia a OpenAI
// para poder referenciarlo en el chat. El límite de 4.5MB de body no aplica: el
// archivo lo BAJA la función, no viene en la request.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`upload-register:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { path, name, type } = await request.json().catch(() => ({}));
  if (typeof path !== "string" || typeof name !== "string") {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  // /sign firma paths con el prefijo del usuario. Sin esta comprobación,
  // cualquiera podría registrar (y por tanto leer) el adjunto de otro miembro.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 403 });
  }

  const service = createServiceClient();

  // Reintentos de red: si OpenAI ya recibió este objeto, devolver el mismo ID
  // en lugar de crear copias y cobrar/procesar la misma imagen otra vez.
  const { data: existing } = await service
    .from("uploaded_files")
    .select("openai_file_id, mime, name")
    .eq("user_id", user.id)
    .eq("storage_path", path)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      file_id: existing.openai_file_id,
      name: existing.name,
      mime: existing.mime,
      kind: kindFromMime(existing.mime),
    });
  }

  const { data: blob, error } = await service.storage.from("chat-uploads").download(path);
  if (error || !blob) {
    return NextResponse.json({ error: "No se encontró el archivo subido" }, { status: 404 });
  }

  // El tamaño declarado en /sign lo puso el cliente; este es el real.
  const declaredMime = typeof type === "string" ? type.toLowerCase() : "";
  const signature = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detectedImageMime = detectSupportedImageMime(signature);
  if (declaredMime.startsWith("image/") && !detectedImageMime) {
    await service.storage.from("chat-uploads").remove([path]);
    return NextResponse.json(
      { error: "La imagen está dañada o su formato real no es JPG, PNG, GIF o WebP" },
      { status: 400 }
    );
  }

  // La firma binaria manda sobre los metadatos del navegador. Esto también
  // recupera imágenes pegadas desde apps que no informan el MIME.
  const finalMime = detectedImageMime || declaredMime || blob.type || "application/octet-stream";
  // rejectReason ya aplica el tope correcto según el tipo (25MB general, 100MB
  // para video) — no hace falta un segundo chequeo de tamaño acá, y uno fijo
  // en MAX_SIZE_BYTES rechazaría de más cualquier video de más de 25MB.
  const reason = rejectReason(finalMime, blob.size, !!process.env.GEMINI_API_KEY);
  if (reason) {
    await service.storage.from("chat-uploads").remove([path]);
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  if (finalMime.startsWith("video/")) {
    return registerVideo({ service, userId: user.id, path, name, finalMime, blob });
  }

  // Las imágenes van con nombre neutro para que el modelo no pueda citar el
  // archivo del dispositivo; los documentos conservan el suyo.
  const openaiName = detectedImageMime
    ? openaiImageName(finalMime)
    : normalizeUploadFileName(name, finalMime);
  let uploaded;
  try {
    uploaded = await openai.files.create({
      file: new File([blob], openaiName, { type: finalMime }),
      purpose: "user_data",
    });
  } catch (uploadError) {
    console.error("upload/register OpenAI error", {
      path,
      mime: finalMime,
      name: openaiName,
      error: uploadError instanceof Error ? uploadError.message : String(uploadError),
    });
    return NextResponse.json(
      { error: detectedImageMime ? "OpenAI no pudo procesar la imagen" : "OpenAI no pudo procesar el archivo" },
      { status: 422 }
    );
  }

  // El mapeo permite reconstruir las miniaturas al recargar el historial.
  // Ya no es best-effort: /api/chat valida este ownership antes de enviar el
  // adjunto. Aceptar el upload sin mapa dejaría una imagen visible que luego
  // falla al pulsar Enviar.
  const { error: mapError } = await service.from("uploaded_files").insert({
    openai_file_id: uploaded.id,
    user_id: user.id,
    storage_path: path,
    mime: finalMime,
    name,
  });
  if (mapError) {
    await Promise.allSettled([
      openai.files.delete(uploaded.id),
      service.storage.from("chat-uploads").remove([path]),
    ]);
    console.error("upload/register mapping error", { code: mapError.code, message: mapError.message });
    return NextResponse.json({ error: "No se pudo registrar el archivo" }, { status: 500 });
  }

  return NextResponse.json({
    file_id: uploaded.id,
    name,
    mime: finalMime,
    kind: detectedImageMime ? "image" : "document",
  });
}

/**
 * Rama de video de /api/upload/register: nunca sube el video a OpenAI (la
 * Responses API no lo entiende, y sería carísimo/inútil). En su lugar lo sube
 * a la Files API de Gemini, pide una descripción y guarda ESA descripción
 * como el "contenido" del archivo (uploaded_files.video_description) — el
 * modelo la recibe como texto plano (ver src/lib/chat-content.ts).
 *
 * Mismo patrón RESERVAR-LUEGO-VERIFICAR que /api/transcribe para el gasto de
 * Whisper: se escribe el costo peor caso en `usage_events` ANTES de llamar a
 * Gemini, y se corrige (o se borra, si algo falla) después con el costo real.
 */
async function registerVideo({
  service,
  userId,
  path,
  name,
  finalMime,
  blob,
}: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  path: string;
  name: string;
  finalMime: string;
  blob: Blob;
}) {
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
    console.error("upload/register video reservation failed", {
      code: reservationError?.code,
      message: reservationError?.message,
    });
    return NextResponse.json(
      { error: "No se pudo iniciar el análisis del video. Inténtalo de nuevo en un momento." },
      { status: 503 }
    );
  }

  const releaseReservation = async () => {
    const { error } = await service.from("usage_events").delete().eq("id", reservation.id);
    if (error) {
      // Queda una reserva de más contra el gasto registrado. Lado seguro
      // (sobreestima, no subestima) pero hay que poder verlo.
      console.error("upload/register video reservation release failed", {
        id: reservation.id,
        code: error.code,
        message: error.message,
      });
    }
  };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    await releaseReservation();
    return NextResponse.json(
      { error: "El análisis de video no está disponible todavía (falta configurar GEMINI_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { fileUri, mimeType } = await uploadVideo(fetch, geminiKey, {
      bytes,
      mimeType: finalMime,
      displayName: name,
    });
    const { text: description, tokensIn, tokensOut } = await describeVideo(fetch, geminiKey, { fileUri, mimeType });
    if (!description.trim()) throw new Error("Gemini no devolvió una descripción del video");

    // Se ajusta la reserva al costo real, casi siempre menor que el peor caso.
    const { error: usageError } = await service
      .from("usage_events")
      .update({ tokens_in: tokensIn, tokens_out: tokensOut, cost: estimateGeminiCost(tokensIn, tokensOut) })
      .eq("id", reservation.id);
    if (usageError) {
      console.error("upload/register video usage reconcile error", {
        code: usageError.code,
        message: usageError.message,
      });
    }

    // ID sintético: este archivo NUNCA existió en OpenAI. Prefijo obvio para
    // que nadie lo confunda con un file_id real al leer la tabla.
    const openaiFileId = `video_${crypto.randomUUID()}`;
    const { error: mapError } = await service.from("uploaded_files").insert({
      openai_file_id: openaiFileId,
      user_id: userId,
      storage_path: path,
      mime: finalMime,
      name,
      video_description: description.trim(),
    });
    if (mapError) {
      // El costo real de Gemini ya se gastó y ya se corrigió arriba: no se
      // borra esa fila de usage_events, sería esconder un gasto que sí
      // ocurrió. El blob de Storage queda huérfano (mismo caso que cualquier
      // otro archivo subido y nunca registrado — lo recoge la limpieza
      // existente, ver scripts/lib/orphan-files.mjs).
      console.error("upload/register video mapping error", { code: mapError.code, message: mapError.message });
      return NextResponse.json({ error: "No se pudo registrar el video" }, { status: 500 });
    }

    return NextResponse.json({ file_id: openaiFileId, name, mime: finalMime, kind: "video" as const });
  } catch (videoError) {
    // Ningún paso de Gemini llegó a buen puerto: se suelta la reserva (no se
    // gastó nada de verdad) y se propaga el motivo de Gemini tal cual — por
    // ejemplo, un video que excede su límite de duración no se valida acá (no
    // hay ffprobe en serverless, ver upload-limits.ts) y llega como este error.
    await releaseReservation();
    console.error("upload/register video processing error", {
      path,
      mime: finalMime,
      error: videoError instanceof Error ? videoError.message : String(videoError),
    });
    return NextResponse.json(
      {
        error:
          videoError instanceof Error
            ? `No se pudo analizar el video: ${videoError.message}`
            : "No se pudo analizar el video",
      },
      { status: 422 }
    );
  }
}
