// Qué archivos considera huérfanos la limpieza.
//
// Vive fuera del script para poder testearlo: decide borrados irreversibles en
// tres sistemas a la vez (Storage, OpenAI y la base), así que un error acá no
// se nota hasta que alguien busca un archivo y ya no está.

/** Días que un archivo sobrevive aunque no lo referencie ningún mensaje. */
export const DEFAULT_KEEP_DAYS = 30;

/**
 * Archivos a borrar: los que ningún mensaje referencia Y son más viejos que la
 * ventana de gracia.
 *
 * La ventana existe desde que el composer tiene biblioteca (`@`). Antes, un
 * archivo solo servía para ir pegado a un mensaje, así que "sin mensaje" era
 * exactamente "basura". Ahora los archivos se reusan entre conversaciones, y
 * borrar una conversación dejaría sin referencias a archivos que la persona
 * todavía espera encontrar en su biblioteca.
 *
 * No resuelve el caso del todo —pasados los 30 días el archivo se reapea igual—
 * pero convierte una pérdida silenciosa e inmediata en uña acotada y previsible.
 *
 * @param uploaded  filas de uploaded_files con { openai_file_id, storage_path, created_at }
 * @param referenced  Set de openai_file_id que aparecen en algún mensaje
 * @param keepDays  ventana de gracia en días
 * @param now  instante de referencia (inyectado para poder testear)
 */
export function selectOrphans(uploaded, referenced, keepDays = DEFAULT_KEEP_DAYS, now = Date.now()) {
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  return uploaded.filter((file) => {
    if (referenced.has(file.openai_file_id)) return false;
    // Sin fecha no se puede saber la antigüedad: se conserva. Ante la duda, no
    // se borra — es la dirección segura del error.
    if (!file.created_at) return false;
    return new Date(file.created_at).getTime() < cutoff;
  });
}
