// Copy que ve el usuario al adjuntar video. Vive aparte de Gemini para que
// Composer no importe el cliente de upload.

import { MAX_VIDEO_SIZE_MB } from "./upload-limits";

export const VIDEO_ANALYZING_LABEL = "Transcribiendo audio y escenas...";

export const VIDEO_ANALYZING_HINT = "Puedes seguir escribiendo. Enviar espera al adjunto.";

export const VIDEO_ATTACH_TITLE =
  `Adjuntar imágenes, archivos o video (hasta ${MAX_VIDEO_SIZE_MB} MB). ` +
  "El video se transcribe (voz o letra) y se describe por escenas. " +
  "Las imágenes también se pegan con Ctrl+V";
