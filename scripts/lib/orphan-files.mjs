// Qué archivos considera basura la limpieza.
//
// Vive fuera del script para poder testearlo: decide borrados irreversibles en
// tres sistemas a la vez (Storage, OpenAI y la base), así que un error acá no
// se nota hasta que alguien busca un archivo y ya no está.

/** Días que un archivo nunca enviado sobrevive antes de ser recolectable. */
export const DEFAULT_KEEP_DAYS = 30;

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
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
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
