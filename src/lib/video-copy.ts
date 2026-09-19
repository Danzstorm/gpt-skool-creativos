// Copy que ve el usuario al adjuntar video. Vive aparte de Gemini para que
// Composer no importe el cliente de upload.

import { MAX_VIDEO_MINUTES, MAX_VIDEO_SECONDS, MAX_VIDEO_SIZE_MB } from "./upload-limits";

export const VIDEO_ANALYZING_LABEL = "Transcribiendo audio y escenas...";

export const VIDEO_ANALYZING_HINT = "Puedes seguir escribiendo. Enviar espera al adjunto.";

export const VIDEO_ATTACH_TITLE =
  `Adjuntar imágenes, archivos o video (hasta ${MAX_VIDEO_SIZE_MB} MB / ${MAX_VIDEO_MINUTES} min). ` +
  "El video se transcribe (voz o letra) y se describe por escenas. " +
  "Las imágenes también se pegan con Ctrl+V";

export function formatVideoClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

/** Motivo si el clip es más largo de lo que cubrimos. Sin duración leíble, no corta. */
export function videoDurationRejectReason(durationSeconds: number | null): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) return null;
  if (durationSeconds > MAX_VIDEO_SECONDS) {
    return `dura ${formatVideoClock(durationSeconds)}; cubrimos hasta ${MAX_VIDEO_MINUTES} minutos`;
  }
  return null;
}
