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

/**
 * Un adjunto identificable: lo mínimo para poder numerarlo dentro del hilo.
 *
 * `n` es el número que YA se le dijo al modelo, guardado junto al archivo en
 * `messages.files` al mandarlo. Existe porque deducir el rótulo y esperar que
 * coincida no alcanza: el historial del modelo vive en OpenAI y no se puede
 * reescribir, así que cualquier cambio en cómo se cuenta desincroniza lo que ve
 * el usuario de lo que el modelo escuchó. Registrado, el rótulo es un hecho.
 */
export type IdentifiedAttachment = AttachmentLike & { openai_file_id: string; n?: number };

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
  const n = (file as { n?: unknown }).n;
  return {
    openai_file_id: id,
    type: type === "image" || type === "video" ? type : "document",
    ...(typeof n === "number" && Number.isInteger(n) && n > 0 ? { n } : {}),
  };
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
 * QUÉ PASA CON LO QUE YA EXISTÍA. Los mensajes mandados antes de que esto
 * existiera no tienen `n` guardado, y su historial en OpenAI lleva grabada la
 * numeración vieja, que era por mensaje y se reiniciaba. Ese historial no se
 * puede reescribir, así que para esos archivos se reconstruye la cuenta POR
 * MENSAJE: es la única que coincide con lo que el modelo realmente escuchó.
 * Inventarles un número nuevo haría que el menú prometa una referencia que el
 * modelo no puede resolver.
 *
 * Los números nuevos arrancan por encima del total de archivos del hilo, que es
 * una cota superior de cualquier rótulo viejo — así nunca chocan con uno.
 *
 * `history` va del mensaje más viejo al más nuevo, y `outgoing` es el mensaje
 * que se está por mandar. La misma función la usan el servidor para rotular lo
 * que recibe el modelo, el composer para las burbujas y el menú `@`.
 */
export function assignThreadNumbers(
  // `files` opcional: los mensajes del cliente (`Message`) no la traen cuando
  // el turno no tuvo adjuntos, y las filas de la base la traen en null.
  history: { files?: unknown }[],
  outgoing: IdentifiedAttachment[] = []
): ThreadNumbers {
  const images = new Map<string, number>();
  const videos = new Map<string, number>();
  let totalImages = 0;
  let totalVideos = 0;
  let maxImage = 0;
  let maxVideo = 0;

  for (const { files } of history) {
    if (!Array.isArray(files)) continue;
    // Contadores del mensaje: el respaldo para lo mandado antes de que se
    // guardara `n`, porque reproducen la numeración que recibió el modelo.
    let legacyImage = 0;
    let legacyVideo = 0;

    for (const raw of files) {
      const file = readStored(raw);
      if (!file) continue;

      if (file.type === "image") {
        totalImages++;
        const n = file.n ?? ++legacyImage;
        if (!images.has(file.openai_file_id)) images.set(file.openai_file_id, n);
        maxImage = Math.max(maxImage, n);
      } else if (file.type === "video") {
        totalVideos++;
        const n = file.n ?? ++legacyVideo;
        if (!videos.has(file.openai_file_id)) videos.set(file.openai_file_id, n);
        maxVideo = Math.max(maxVideo, n);
      }
    }
  }

  let nextImage = Math.max(maxImage, totalImages) + 1;
  let nextVideo = Math.max(maxVideo, totalVideos) + 1;

  for (const file of outgoing) {
    if (file.type === "image") {
      if (!images.has(file.openai_file_id)) {
        images.set(file.openai_file_id, file.n ?? nextImage++);
      }
    } else if (file.type === "video") {
      if (!videos.has(file.openai_file_id)) {
        videos.set(file.openai_file_id, file.n ?? nextVideo++);
      }
    }
  }

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

/** Cómo se nombra un documento cuando el hilo le asigna número. */
export function documentLabel(position: number): string {
  return `archivo ${position}`;
}

/**
 * Token que se inserta en el composer al referenciar con `@`.
 *
 * Es el chip que ve la persona (`@Imagen 2`). El modelo sigue recibiendo
 * `imageLabel` / `videoLabel` / `documentLabel` — ver resolveMentionTokens.
 */
export function imageMention(position: number): string {
  return `@Imagen ${position}`;
}

export function videoMention(position: number): string {
  return `@Video ${position}`;
}

export function documentMention(position: number): string {
  return `@Archivo ${position}`;
}
