// Qué archivos considera basura la limpieza.
//
// Vive fuera del script para poder testearlo: decide borrados irreversibles en
// tres sistemas a la vez (Storage, OpenAI y la base), así que un error acá no
// se nota hasta que alguien busca un archivo y ya no está.

/** Días que un archivo nunca enviado sobrevive antes de ser recolectable. */
export const DEFAULT_KEEP_DAYS = 30;

/**
 * Días que un blob de Storage sin fila en `uploaded_files` sobrevive.
 *
 * Eso no es un adjunto abandonado en el composer: es una subida que se firmó
 * y se guardó en el bucket, pero `/register` nunca llegó a mapearla (pestaña
 * cerrada, 422 de OpenAI/Gemini, fallo de red). No hay biblioteca que proteger
 * — no hay fila — así que la gracia puede ser más corta que la de los huérfanos
 * registrados. Siete días cubre reintentos; no espera un mes a 100 MB de video.
 */
export const DEFAULT_UNREGISTERED_KEEP_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Archivos a borrar. Hacen falta TRES condiciones a la vez, y ninguna alcanza
 * sola:
 *
 *   1. `attached_at` nulo — nunca se envió.
 *   2. Ningún mensaje lo referencia.
 *   3. Más viejo que la ventana de gracia.
 *
 * Por qué dos señales de "no se usó" y no una:
 *
 * - **Solo alcanzabilidad** era la regla vieja, y borraba biblioteca legítima:
 *   con el menú `@`, un archivo puede estar vivo y sin ningún mensaje que lo
 *   apunte porque su conversación se borró.
 * - **Solo `attached_at`** tampoco alcanza, porque esa marca se escribe con
 *   best-effort (`src/lib/message-attachments.ts`): si esa actualización falla
 *   —un corte de red, un timeout— el archivo se envió igual pero queda con la
 *   marca en nulo, y quedaría elegible para siempre.
 *
 * Las dos señales fallan de formas distintas e independientes, así que exigir
 * que las dos digan "no se usó" convierte cada una en la red de la otra. Para
 * un borrado que no se puede deshacer, ese es el intercambio correcto: se
 * conserva basura de más antes que perder algo de alguien.
 *
 * @param uploaded  filas con { openai_file_id, storage_path, created_at, attached_at }
 * @param referenced  Set de openai_file_id que aparecen en algún mensaje
 * @param keepDays  ventana de gracia en días
 * @param now  instante de referencia (inyectado para poder testear)
 */
export function selectOrphans(
  uploaded,
  referenced,
  keepDays = DEFAULT_KEEP_DAYS,
  now = Date.now()
) {
  const cutoff = now - keepDays * MS_PER_DAY;
  return uploaded.filter((file) => {
    // Se envió alguna vez: es biblioteca del usuario, no se toca nunca.
    if (file.attached_at) return false;
    // La marca pudo no haberse escrito; si algún mensaje lo apunta, se envió.
    if (referenced.has(file.openai_file_id)) return false;
    // Sin fecha de subida no se puede saber la antigüedad: se conserva. Ante la
    // duda no se borra, que es la dirección segura cuando lo de enfrente es
    // irreversible.
    if (!file.created_at) return false;
    return new Date(file.created_at).getTime() < cutoff;
  });
}

/**
 * Blobs del bucket que no tienen fila en `uploaded_files`.
 *
 * El comentario de `/api/upload/register` ya decía que esta limpieza los
 * recogía; hasta ahora solo miraba filas de `uploaded_files`. Un PUT a la URL
 * firmada sin registro posterior dejaba el objeto para siempre.
 *
 * @param {Array<{name: string, created_at: string|null, bytes?: number}>} objects
 * @param {Set<string>} registeredPaths
 * @param {number} [keepDays]
 * @param {number} [now]
 * @returns {Array<{name: string, created_at: string|null, bytes?: number}>}
 */
export function selectUnregisteredBlobs(
  objects,
  registeredPaths,
  keepDays = DEFAULT_UNREGISTERED_KEEP_DAYS,
  now = Date.now()
) {
  const cutoff = now - keepDays * MS_PER_DAY;
  return objects.filter((object) => {
    if (!object?.name) return false;
    if (registeredPaths.has(object.name)) return false;
    if (!object.created_at) return false;
    return new Date(object.created_at).getTime() < cutoff;
  });
}

/** Tamaño para humanos. Usa base 10 (1 GB = 1e9) para alinearse al dashboard. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "tamaño desconocido";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

/**
 * Suma bytes conocidos. `unknown` son filas sin tamaño (listado de Storage
 * falló o el objeto no trajo metadata). No se inventa un promedio acá: el
 * informe debe distinguir "1.2 GB medidos" de "771 archivos, tamaño ?".
 */
export function summarizeBytes(rows) {
  let knownBytes = 0;
  let known = 0;
  let unknown = 0;
  for (const row of rows) {
    if (Number.isFinite(row?.bytes) && row.bytes >= 0) {
      knownBytes += row.bytes;
      known += 1;
    } else {
      unknown += 1;
    }
  }
  return { count: rows.length, known, unknown, knownBytes };
}
