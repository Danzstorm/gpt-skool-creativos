// Reglas de adjuntos, compartidas entre el endpoint que firma la subida y el
// que la registra. Estaban duplicadas en una sola ruta; al separar el flujo en
// dos pasos tienen que coincidir o se firma algo que después se rechaza.

// Tope real de la plataforma. El navegador sube directo a Supabase Storage, así
// que el techo de 4.5MB de las funciones de Vercel ya no aplica; este número lo
// fijamos nosotros para no llenar el Storage ni reventar la memoria de la
// función que después copia el archivo a OpenAI.
export const MAX_SIZE_MB = 25;
export const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/x-python", "application/javascript", "text/typescript",
];

/** Motivo del rechazo, o null si el archivo es aceptable. */
export function rejectReason(type: string, size: number): string | null {
  if (size > MAX_SIZE_BYTES) return `supera el límite de ${MAX_SIZE_MB}MB`;
  // Sin `type` el navegador no reconoció el formato; lo dejamos pasar y que
  // OpenAI decida, como hacía la ruta original.
  if (type && !ALLOWED_TYPES.includes(type)) return `tipo de archivo no permitido (${type})`;
  return null;
}
