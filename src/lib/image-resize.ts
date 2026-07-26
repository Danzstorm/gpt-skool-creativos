// Reduce imágenes en el navegador antes de subirlas.
//
// Las funciones de Vercel rechazan cualquier request con body > 4.5MB
// (413 FUNCTION_PAYLOAD_TOO_LARGE), y una foto de celular pesa 3-8MB, así que
// sin esto buena parte de los adjuntos del chat fallaba. Reducir del lado del
// cliente además acorta bastante la subida en conexiones móviles.
//
// 2048px de lado mayor es más que suficiente para lo que la visión del modelo
// aprovecha; subir el original no mejora la respuesta, solo la espera.

const MAX_DIMENSION = 2048;
const QUALITY = 0.85;
const OPENAI_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Los GIF animados perderían la animación al pasar por canvas.
  if (file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

    // Ya es chica y liviana: no vale la pena recomprimir (perdería calidad a cambio de nada).
    if (OPENAI_IMAGE_TYPES.has(file.type) && scale === 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // PNG se mantiene PNG para no arruinar capturas con texto o transparencia.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = type === "image/jpeg" ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name;
    return new File([blob], name, { type });
  } catch {
    // Formato que el navegador no sabe decodificar (HEIC en algunos casos):
    // se sube el original y que el servidor decida.
    return file;
  }
}
