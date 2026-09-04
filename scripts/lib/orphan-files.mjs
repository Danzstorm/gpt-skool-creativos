// Qué archivos considera basura la limpieza.
//
// Vive fuera del script para poder testearlo: decide borrados irreversibles en
// tres sistemas a la vez (Storage, OpenAI y la base), así que un error acá no
// se nota hasta que alguien busca un archivo y ya no está.

/** Días que un archivo nunca enviado sobrevive antes de ser recolectable. */
export const DEFAULT_KEEP_DAYS = 30;

/**
 * Archivos a borrar: los que **nunca llegaron a mandarse** y ya pasaron la
 * ventana de gracia.
 *
 * La regla es `attached_at is null`, no "ningún mensaje lo referencia". La
 * diferencia es el corazón de esto:
 *
 * - Antes, un archivo existía solo para ir pegado a un mensaje, así que "sin
 *   mensaje" equivalía a "basura".
 * - Con la biblioteca del composer (`@`), un archivo puede estar vivo y no
 *   tener ningún mensaje que lo apunte, porque su conversación se borró o el
 *   mensaje se editó. Deducir por alcanzabilidad borraba biblioteca legítima.
 *
 * `attached_at` registra el hecho que importa —si alguna vez se envió— en vez
 * de inferirlo de un grafo que cambia por debajo. Lo que sigue siendo
 * recolectable es lo de siempre: se subió un archivo y nunca se mandó.
 *
 * La ventana de gracia queda para ese caso: alguien adjunta algo, no lo manda
 * todavía y vuelve mañana a terminar el mensaje.
 *
 * @param uploaded  filas con { openai_file_id, storage_path, created_at, attached_at }
 * @param keepDays  ventana de gracia en días
 * @param now  instante de referencia (inyectado para poder testear)
 */
export function selectOrphans(uploaded, keepDays = DEFAULT_KEEP_DAYS, now = Date.now()) {
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  return uploaded.filter((file) => {
    // Se envió alguna vez: es biblioteca del usuario, no se toca nunca.
    if (file.attached_at) return false;
    // Sin fecha de subida no se puede saber la antigüedad: se conserva. Ante la
    // duda no se borra, que es la dirección segura cuando lo de enfrente es
    // irreversible.
    if (!file.created_at) return false;
    return new Date(file.created_at).getTime() < cutoff;
  });
}
