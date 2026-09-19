// Reglas de adjuntos, compartidas entre el endpoint que firma la subida y el
// que la registra. Estaban duplicadas en una sola ruta; al separar el flujo en
// dos pasos tienen que coincidir o se firma algo que después se rechaza.

// Tope real de la plataforma. El navegador sube directo a Supabase Storage, así
// que el techo de 4.5MB de las funciones de Vercel ya no aplica; este número lo
// fijamos nosotros para no llenar el Storage ni reventar la memoria de la
// función que después copia el archivo a OpenAI.
export const MAX_SIZE_MB = 25;
export const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// Los videos nunca van a OpenAI (los describe Gemini, ver /api/upload/register
// y src/lib/gemini-upload.ts), así que su tope de tamaño es propio y más alto:
// no comparten el límite pensado para no reventar la función que copia a
// OpenAI. Debe coincidir con el file_size_limit del bucket chat-uploads
// (supabase/migrations/20260906120000_video_uploads.sql).
export const MAX_VIDEO_SIZE_MB = 100;
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
// Tope de lo que pedimos a Gemini (reserva de costo + copy de UI). El
// servidor no tiene ffprobe; el navegador lee `video.duration` y avisa.
export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_MINUTES = MAX_VIDEO_SECONDS / 60;

export const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/x-python", "application/javascript", "text/typescript",
];

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

// Duración: el servidor no sonda (no hay ffprobe). El cliente lee metadata
// del video y rechaza con copy de UI si pasa de MAX_VIDEO_SECONDS.

/**
 * Motivo del rechazo, o null si el archivo es aceptable.
 *
 * `videoEnabled` es si hay GEMINI_API_KEY configurada. El video no se adjunta
 * como archivo: se describe con Gemini, así que sin key no hay nada que hacer
 * con él. El rechazo vive acá y no en cada ruta porque esta es la puerta que
 * comparten /upload/sign y /upload/register — en sign corta ANTES de firmar,
 * así nadie sube 100MB a Storage para que recién el registro le diga que no.
 * Sin valor por defecto a propósito: un `true` por omisión volvería a abrir la
 * puerta en la próxima ruta que llame a esto.
 */
export function rejectReason(type: string, size: number, videoEnabled: boolean): string | null {
  if (type && ALLOWED_VIDEO_TYPES.includes(type)) {
    if (!videoEnabled) return "el análisis de video no está disponible todavía";
    if (size > MAX_VIDEO_SIZE_BYTES) return `supera el límite de ${MAX_VIDEO_SIZE_MB}MB para video`;
    return null;
  }
  if (size > MAX_SIZE_BYTES) return `supera el límite de ${MAX_SIZE_MB}MB`;
  // Sin `type` el navegador no reconoció el formato; lo dejamos pasar y que
  // OpenAI decida, como hacía la ruta original.
  if (type && !ALLOWED_TYPES.includes(type)) return `tipo de archivo no permitido (${type})`;
  return null;
}
