// Cómo se llaman los adjuntos de un mensaje, en un solo lugar.
//
// El problema que resuelve: el composer ya numeraba las imágenes en pantalla
// ("img 1", "img 2") pero al modelo nunca se le decía nada, así que lo único
// que él tenía para nombrarlas era el nombre del archivo del dispositivo — de
// ahí salían respuestas como "Referencias de Imagen 3: mt.data.image23490.png"
// (que además es /mnt/data, la ruta donde el contenedor monta los archivos).
//
// Si la UI y el servidor calcularan la numeración por separado, cualquier
// cambio en uno los desincroniza y el usuario ve "imagen 2" mientras el modelo
// habla de otra. Por eso la cuenta vive acá y la usan los dos.

export type AttachmentLike = { type: "image" | "document" };

/**
 * Posición 1-based de un adjunto **entre las imágenes** del mensaje, o null si
 * no es una imagen.
 *
 * Cuenta solo imágenes a propósito: en `[documento, imagen, documento, imagen]`
 * las etiquetas son 1 y 2, no 2 y 4. Al usuario le da igual dónde quedaron los
 * documentos en el array.
 */
export function imageNumber(files: AttachmentLike[], index: number): number | null {
  const file = files[index];
  if (!file || file.type !== "image") return null;

  let count = 0;
  for (let i = 0; i <= index; i++) {
    if (files[i]?.type === "image") count++;
  }
  return count;
}

/** Cómo se nombra una imagen, tanto en pantalla como para el modelo. */
export function imageLabel(position: number): string {
  return `imagen ${position}`;
}
