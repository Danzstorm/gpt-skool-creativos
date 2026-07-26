import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { MAX_SIZE_BYTES, rejectReason } from "@/lib/upload-limits";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { detectSupportedImageMime, normalizeUploadFileName } from "@/lib/upload-file";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      kind: existing.mime?.startsWith("image/") ? "image" : "document",
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
  const reason = rejectReason(finalMime, blob.size);
  if (reason || blob.size > MAX_SIZE_BYTES) {
    await service.storage.from("chat-uploads").remove([path]);
    return NextResponse.json({ error: reason ?? "Archivo demasiado grande" }, { status: 400 });
  }

  const openaiName = normalizeUploadFileName(name, finalMime);
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
