import { describe, expect, it } from "vitest";
// El filtro vive en un .mjs porque lo importa un script de Node suelto, que no
// pasa por el build de Next. Se testea desde acá igual: decide borrados
// irreversibles en Storage, OpenAI y la base a la vez.
import { DEFAULT_KEEP_DAYS, selectOrphans } from "../../scripts/lib/orphan-files.mjs";

const AHORA = new Date("2026-09-03T00:00:00Z").getTime();
const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(AHORA - dias * DIA).toISOString();

/** Subido hace N días y nunca enviado. */
const nuncaEnviado = (id: string, dias: number) => ({
  openai_file_id: id,
  storage_path: `u/${id}.png`,
  created_at: hace(dias),
  attached_at: null,
});

/** Subido hace N días y enviado alguna vez: biblioteca del usuario. */
const enviado = (id: string, dias: number) => ({
  ...nuncaEnviado(id, dias),
  attached_at: hace(dias),
});

const ids = (rows: Array<{ openai_file_id: string }>) => rows.map((r) => r.openai_file_id);

describe("selectOrphans", () => {
  it("NUNCA borra un archivo que se envió alguna vez", () => {
    // Es la regla que da sentido a la biblioteca. Da igual la antigüedad y da
    // igual que su conversación ya no exista: si se mandó, es del usuario.
    expect(selectOrphans([enviado("file-A", 4000)], new Set(), 30, AHORA)).toEqual([]);
  });

  it("no depende de que un mensaje siga apuntando al archivo", () => {
    // El fallo que motivó el cambio: antes se deducía por alcanzabilidad, así
    // que borrar una conversación dejaba sus archivos a merced de la limpieza
    // aunque siguieran en la biblioteca de su dueño.
    const borroSuConversacion = { ...enviado("file-A", 90) };
    expect(selectOrphans([borroSuConversacion], new Set(), 30, AHORA)).toEqual([]);
  });

  it("borra lo que se subió y nunca se mandó, pasada la ventana", () => {
    // Este sí es el caso original: alguien adjuntó algo y cerró la pestaña.
    expect(ids(selectOrphans([nuncaEnviado("file-A", 40)], new Set(), 30, AHORA))).toEqual(["file-A"]);
  });

  it("protege lo nunca enviado pero reciente", () => {
    // Alguien adjunta hoy, no manda todavía y vuelve mañana a terminar.
    expect(selectOrphans([nuncaEnviado("file-nuevo", 3)], new Set(), 30, AHORA)).toEqual([]);
  });

  it("el límite es estricto: justo en la ventana todavía se conserva", () => {
    expect(selectOrphans([nuncaEnviado("file-A", 30)], new Set(), 30, AHORA)).toEqual([]);
    expect(selectOrphans([nuncaEnviado("file-A", 31)], new Set(), 30, AHORA)).toHaveLength(1);
  });

  it("conserva un archivo sin fecha de subida en vez de borrarlo", () => {
    // Ante la duda no se borra: es la dirección segura del error cuando lo que
    // está del otro lado es irreversible.
    const sinFecha = {
      openai_file_id: "file-X",
      storage_path: "u/x.png",
      created_at: null,
      attached_at: null,
    };
    expect(selectOrphans([sinFecha], new Set(), 30, AHORA)).toEqual([]);
  });

  it("con keepDays 0 sigue sin tocar la biblioteca", () => {
    // La vía de escape para una limpieza agresiva no puede convertirse en una
    // forma de borrar archivos enviados.
    const lote = [nuncaEnviado("file-basura", 0.5), enviado("file-biblioteca", 0.5)];
    expect(ids(selectOrphans(lote, new Set(), 0, AHORA))).toEqual(["file-basura"]);
  });

  it("separa correctamente un lote mezclado", () => {
    const lote = [
      enviado("file-1", 500),
      nuncaEnviado("file-2", 500),
      enviado("file-3", 1),
      nuncaEnviado("file-4", 1),
    ];
    expect(ids(selectOrphans(lote, new Set(), 30, AHORA))).toEqual(["file-2"]);
  });

  it("no borra un archivo referenciado aunque la marca no se haya escrito", () => {
    // attached_at se escribe con best-effort: si esa actualización falla, un
    // archivo enviado queda con la marca en nulo. La alcanzabilidad es la red
    // de esa falla — las dos señales fallan de formas distintas, así que se
    // exigen las dos.
    const marcaPerdida = nuncaEnviado("file-A", 400);
    expect(selectOrphans([marcaPerdida], new Set(["file-A"]), 30, AHORA)).toEqual([]);
  });

  it("borra solo cuando LAS DOS señales dicen que no se usó", () => {
    const lote = [
      enviado("file-marcado", 400),
      nuncaEnviado("file-referenciado", 400),
      nuncaEnviado("file-basura", 400),
    ];
    expect(ids(selectOrphans(lote, new Set(["file-referenciado"]), 30, AHORA))).toEqual([
      "file-basura",
    ]);
  });

  it("la ventana por defecto es de 30 días", () => {
    expect(DEFAULT_KEEP_DAYS).toBe(30);
  });
});
