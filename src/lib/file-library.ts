// Qué archivos del hilo muestra el menú `@`, y con qué nombre.
//
// Vive fuera de la ruta para poder testearse: decidir qué entra en una lista y
// cómo se llama cada cosa es la clase de lógica que se rompe en silencio.

/** Fila de `uploaded_files` tal como la pide /api/files. */
export type UploadedRow = {
  openai_file_id: string;
  name: string | null;
  mime: string | null;
  storage_path: string | null;
  created_at: string;
};

export interface LibraryFile {
  openai_file_id: string;
  name: string;
  type: "image" | "document" | "video";
  created_at: string;
  /** URL firmada de Storage, solo para imágenes (la miniatura del menú). */
  previewUrl?: string;
  /**
   * Cómo llama el MODELO a este archivo ("imagen 2"). Solo para imágenes y
   * videos: los documentos van por su nombre real, que es lo que el modelo
   * recibe como `filename`.
   */
  label?: string;
}

/**
 * Para comparar en el buscador: sin mayúsculas y sin acentos.
 *
 * Lo de los acentos era una limitación conocida del `ilike` de Postgres —
 * buscar "resena" no encontraba "Reseña" y arreglarlo pedía la extensión
 * `unaccent`. Filtrando en memoria sale gratis, porque acá sí están todas las
 * filas del hilo y no solo las que el servidor ya había descartado.
 */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function typeOf(mime: string | null): LibraryFile["type"] {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  return "document";
}

/**
 * Convierte las filas en entradas del menú y se queda con las que coinciden
 * con lo escrito después del `@`.
 *
 * Busca contra el nombre Y el rótulo, porque el menú muestra el rótulo: si solo
 * mirara el nombre, escribir `@imagen` no encontraría una imagen que en pantalla
 * dice "imagen 2". Una consulta vacía devuelve todo, que es el estado al abrir
 * el menú.
 *
 * Devuelve la fila junto a la entrada para que quien llama pueda firmar la
 * miniatura sin volver a buscarla.
 */
export function matchLibraryRows(
  rows: UploadedRow[],
  labels: Map<string, string>,
  query: string
): { row: UploadedRow; base: LibraryFile }[] {
  const needle = fold(query.trim());

  return rows
    .map((row) => {
      const type = typeOf(row.mime);
      const label = labels.get(row.openai_file_id);
      const base: LibraryFile = {
        openai_file_id: row.openai_file_id,
        name: row.name || (type === "image" ? "imagen" : type === "video" ? "video" : "archivo"),
        type,
        created_at: row.created_at,
        // Los documentos se quedan sin rótulo a propósito: su nombre real es
        // información útil y es lo que el modelo recibe como `filename`.
        ...(label && type !== "document" ? { label } : {}),
      };
      return { row, base };
    })
    .filter(({ base }) => {
      if (!needle) return true;
      return fold(base.name).includes(needle) || fold(base.label ?? "").includes(needle);
    });
}
