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

export type AttachmentLike = { type: "image" | "document" | "video" };

/** Un adjunto identificable: lo mínimo para poder numerarlo dentro del hilo. */
export type IdentifiedAttachment = AttachmentLike & { openai_file_id: string };

/** Número de cada archivo dentro del hilo. Imágenes y videos cuentan aparte. */
export interface ThreadNumbers {
  images: Map<string, number>;
  videos: Map<string, number>;
}

/** Lee un elemento de `messages.files`, que viene de la base sin tipar. */
function readStored(file: unknown): IdentifiedAttachment | null {
  if (!file || typeof file !== "object") return null;
  const id = (file as { openai_file_id?: unknown }).openai_file_id;
  if (typeof id !== "string") return null;
  const type = (file as { type?: unknown }).type;
  return { openai_file_id: id, type: type === "image" || type === "video" ? type : "document" };
}

/**
 * Numera los adjuntos del hilo por PRIMERA APARICIÓN: imagen 1, 2, 3… sin
 * reiniciar en cada mensaje.
 *
 * Antes la cuenta era por mensaje, así que en una conversación con varias
 * tandas de imágenes había tres "imagen 1" distintas y pedir "usá la imagen 1"
 * no identificaba ninguna. Con el hilo entero como referencia, un número apunta
 * siempre al mismo archivo.
 *
 * Por primera aparición y no por posición: un archivo re-adjuntado con `@`
 * conserva el número con el que ya se lo conoce en vez de recibir uno nuevo
 * cada vez que se lo vuelve a mandar. Es lo que hace que referenciarlo funcione.
 *
 * `history` va del mensaje más viejo al más nuevo, y `outgoing` es el mensaje
 * que se está por mandar (sus archivos nuevos toman los números siguientes).
 * La misma función la usan el servidor para rotular lo que recibe el modelo, el
 * composer para las burbujas y el menú `@`: si cada uno contara por su lado,
 * cualquier cambio los desincroniza y el usuario ve un número y el modelo otro.
 */
export function assignThreadNumbers(
  // `files` opcional: los mensajes del cliente (`Message`) no la traen cuando
  // el turno no tuvo adjuntos, y las filas de la base la traen en null.
  history: { files?: unknown }[],
  outgoing: IdentifiedAttachment[] = []
): ThreadNumbers {
  const images = new Map<string, number>();
  const videos = new Map<string, number>();

  const take = (file: IdentifiedAttachment | null) => {
    if (!file) return;
    if (file.type === "image") {
      if (!images.has(file.openai_file_id)) images.set(file.openai_file_id, images.size + 1);
    } else if (file.type === "video") {
      if (!videos.has(file.openai_file_id)) videos.set(file.openai_file_id, videos.size + 1);
    }
  };

  for (const { files } of history) {
    if (!Array.isArray(files)) continue;
    for (const file of files) take(readStored(file));
  }
  for (const file of outgoing) take(file);

  return { images, videos };
}

/** Cómo se nombra una imagen, tanto en pantalla como para el modelo. */
export function imageLabel(position: number): string {
  return `imagen ${position}`;
}

/**
 * Cómo se nombra un video, tanto en pantalla como para el modelo. El video en
 * sí nunca llega al modelo (no lo entiende la Responses API) — lo que recibe
 * es la descripción de Gemini bajo este mismo rótulo.
 */
export function videoLabel(position: number): string {
  return `descripción de video ${position}`;
}
