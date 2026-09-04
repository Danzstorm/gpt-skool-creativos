import { describe, expect, it } from "vitest";
// El filtro vive en un .mjs porque lo importa un script de Node suelto, que no
// pasa por el build de Next. Se testea desde acá igual: decide borrados
// irreversibles en Storage, OpenAI y la base a la vez.
import { DEFAULT_KEEP_DAYS, selectOrphans } from "../../scripts/lib/orphan-files.mjs";

const AHORA = new Date("2026-09-03T00:00:00Z").getTime();
const DIA = 24 * 60 * 60 * 1000;

const archivo = (id: string, diasDeAntiguedad: number) => ({
  openai_file_id: id,
  storage_path: `u/${id}.png`,
  created_at: new Date(AHORA - diasDeAntiguedad * DIA).toISOString(),
});

describe("selectOrphans", () => {
  it("no borra lo que algún mensaje referencia, por viejo que sea", () => {
    const uploaded = [archivo("file-A", 400)];
    expect(selectOrphans(uploaded, new Set(["file-A"]), 30, AHORA)).toEqual([]);
  });

  it("borra lo que no referencia nadie y ya pasó la ventana", () => {
    const uploaded = [archivo("file-A", 40)];
    const orphans = selectOrphans(uploaded, new Set(), 30, AHORA);
    expect(orphans.map((f: { openai_file_id: string }) => f.openai_file_id)).toEqual(["file-A"]);
  });

  it("PROTEGE lo reciente aunque no lo referencie ningún mensaje", () => {
    // El caso que motivó la ventana: alguien borra una conversación y sus
    // archivos quedan sin referencia, pero los sigue esperando en la
    // biblioteca del composer.
    const uploaded = [archivo("file-nuevo", 3)];
    expect(selectOrphans(uploaded, new Set(), 30, AHORA)).toEqual([]);
  });

  it("el límite es estricto: justo en la ventana todavía se conserva", () => {
    expect(selectOrphans([archivo("file-A", 30)], new Set(), 30, AHORA)).toEqual([]);
    expect(selectOrphans([archivo("file-A", 31)], new Set(), 30, AHORA)).toHaveLength(1);
  });

  it("conserva un archivo sin fecha en vez de borrarlo", () => {
    // Ante la duda no se borra: es la dirección segura del error cuando lo que
    // está del otro lado es irreversible.
    const sinFecha = { openai_file_id: "file-X", storage_path: "u/x.png", created_at: null };
    expect(selectOrphans([sinFecha], new Set(), 30, AHORA)).toEqual([]);
  });

  it("con keepDays 0 se comporta como antes de la ventana", () => {
    // La vía de escape para una limpieza agresiva deliberada.
    expect(selectOrphans([archivo("file-A", 0.5)], new Set(), 0, AHORA)).toHaveLength(1);
  });

  it("la ventana por defecto es de 30 días", () => {
    expect(DEFAULT_KEEP_DAYS).toBe(30);
  });
});
