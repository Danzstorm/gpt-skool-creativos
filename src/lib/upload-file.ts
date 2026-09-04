const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/x-python": ".py",
  "application/javascript": ".js",
  "text/typescript": ".ts",
};

export const MAX_FILES_PER_MESSAGE = 10;

/**
 * Nombre con el que se registra una IMAGEN en OpenAI.
 *
 * A propósito NO se conserva el del dispositivo. OpenAI resuelve el file_id a
 * su filename del lado del servidor y se lo muestra al modelo, así que el
 * nombre del archivo de quien sube la foto terminaba en la respuesta: de ahí
 * salían cosas como "Referencias de Imagen 3: mt.data.image23490.png".
 *
 * Que varias imágenes del mismo mensaje compartan este nombre no molesta,
 * porque el modelo las direcciona por la etiqueta de texto que va pegada a cada
 * una (ver src/lib/chat-content.ts). Y si el nombre se filtrara igual, se
 * filtra "imagen.jpg", que no delata nada y no contradice la etiqueta.
 *
 * Los DOCUMENTOS conservan su nombre real: ahí sí es información útil.
 */
export function openaiImageName(mime: string): string {
  return `imagen${MIME_EXTENSIONS[mime.toLowerCase()] ?? ".jpg"}`;
}

/**
 * OpenAI valida la extensión de las imágenes de forma sensible a mayúsculas
 * (`.JPG` fue rechazado aunque el contenido fuera JPEG). Además, una imagen
 * redimensionada puede cambiar de WebP a JPEG. El nombre que llega a OpenAI
 * debe derivarse del MIME final, no del nombre original del usuario.
 */
export function normalizeUploadFileName(name: string, mime: string): string {
  const leaf = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "archivo";
  const currentDot = leaf.lastIndexOf(".");
  const currentExtension = currentDot > 0 ? leaf.slice(currentDot).toLowerCase() : "";
  const desiredExtension = MIME_EXTENSIONS[mime.toLowerCase()] ?? currentExtension;
  const stem = (currentDot > 0 ? leaf.slice(0, currentDot) : leaf).trim() || "archivo";

  // Dejamos margen para la extensión y evitamos nombres enormes en Storage/OpenAI.
  return `${stem.slice(0, 160)}${desiredExtension}`;
}

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Detecta los formatos raster que acepta la entrada visual de OpenAI. */
export function detectSupportedImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}
