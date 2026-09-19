// Copy que ve el usuario al adjuntar video. Vive aparte de Gemini para que
// Composer no importe el cliente de upload, y para poder testear que no
// prometemos transcripción verbatim.

import { MAX_VIDEO_SIZE_MB } from "./upload-limits";

export const VIDEO_ANALYZING_LABEL = "Analizando video (escenas + audio)...";

export const VIDEO_ANALYZING_HINT = "No es transcripción palabra por palabra. Puedes seguir escribiendo.";

export const VIDEO_ATTACH_TITLE =
  `Adjuntar imágenes, archivos o video (hasta ${MAX_VIDEO_SIZE_MB} MB). ` +
  "El video se describe por escenas, texto en pantalla y audio; no es transcripción verbatim. " +
  "Las imágenes también se pegan con Ctrl+V";
