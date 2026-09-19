import { describe, expect, it } from "vitest";
// El filtro vive en un .mjs porque lo importa un script de Node suelto, que no
// pasa por el build de Next. Se testea desde acá igual: decide borrados
// irreversibles en Storage, OpenAI y la base a la vez.
import {
  DEFAULT_KEEP_DAYS,
  DEFAULT_STORAGE_QUOTA_GB,
  DEFAULT_UNREGISTERED_KEEP_DAYS,
  formatBytes,
  formatCleanupMarkdown,
  planStorageCleanup,
  resolveCleanThresholdGb,
  resolveStorageQuotaGb,
  selectOrphans,
  selectUnregisteredBlobs,
  shouldAutoClean,
  summarizeBytes,
} from "../../scripts/lib/orphan-files.mjs";

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

describe("selectUnregisteredBlobs", () => {
  const blob = (name: string, dias: number) => ({
    name,
    created_at: hace(dias),
    bytes: 1_000_000,
  });

  it("no toca un path que ya está en uploaded_files", () => {
    expect(
      selectUnregisteredBlobs([blob("u/a.png", 40)], new Set(["u/a.png"]), 7, AHORA)
    ).toEqual([]);
  });

  it("borra el PUT abandonado pasada la gracia corta", () => {
    expect(
      selectUnregisteredBlobs([blob("u/a.png", 8)], new Set(), 7, AHORA).map((o) => o.name)
    ).toEqual(["u/a.png"]);
  });

  it("protege un blob reciente (reintento de /register)", () => {
    expect(selectUnregisteredBlobs([blob("u/a.png", 2)], new Set(), 7, AHORA)).toEqual([]);
  });

  it("sin fecha se conserva", () => {
    expect(
      selectUnregisteredBlobs([{ name: "u/a.png", created_at: null, bytes: 1 }], new Set(), 7, AHORA)
    ).toEqual([]);
  });

  it("la gracia por defecto de blobs sin registrar es 7 días", () => {
    expect(DEFAULT_UNREGISTERED_KEEP_DAYS).toBe(7);
  });
});

describe("umbral de auto-limpieza", () => {
  const umbral80 = 80;

  it("no dispara con 19 GB de un Pro de 100 GB", () => {
    expect(
      shouldAutoClean({ usedBytes: 19e9, thresholdGb: umbral80, listingFailed: false })
    ).toBe(false);
  });

  it("dispara al cruzar el umbral (80 GB inclusive)", () => {
    expect(shouldAutoClean({ usedBytes: 80e9, thresholdGb: umbral80, listingFailed: false })).toBe(true);
    expect(shouldAutoClean({ usedBytes: 81e9, thresholdGb: umbral80, listingFailed: false })).toBe(true);
  });

  it("fail-closed si el listado de Storage falló", () => {
    expect(shouldAutoClean({ usedBytes: 90e9, thresholdGb: umbral80, listingFailed: true })).toBe(false);
  });

  it("fail-closed si los bytes medidos no son un número", () => {
    expect(shouldAutoClean({ usedBytes: null, thresholdGb: umbral80, listingFailed: false })).toBe(false);
    expect(shouldAutoClean({ usedBytes: Number.NaN, thresholdGb: umbral80, listingFailed: false })).toBe(
      false
    );
  });

  it("el default es 80 GB (80% de Pro 100 GB)", () => {
    expect(DEFAULT_STORAGE_QUOTA_GB).toBe(100);
    expect(resolveStorageQuotaGb({})).toBe(100);
    expect(resolveCleanThresholdGb({})).toBe(80);
  });

  it("STORAGE_QUOTA_GB=1 (Free) deja el umbral en 0.8 GB", () => {
    expect(resolveCleanThresholdGb({ STORAGE_QUOTA_GB: "1" })).toBe(0.8);
  });

  it("STORAGE_CLEAN_THRESHOLD_GB pisa el 80% de la cuota", () => {
    expect(
      resolveCleanThresholdGb({ STORAGE_QUOTA_GB: "1", STORAGE_CLEAN_THRESHOLD_GB: "0.95" })
    ).toBe(0.95);
  });

  it("un env inválido no baja el umbral: cae al default alto", () => {
    expect(resolveStorageQuotaGb({ STORAGE_QUOTA_GB: "nope" })).toBe(100);
    expect(resolveCleanThresholdGb({ STORAGE_CLEAN_THRESHOLD_GB: "-5" })).toBe(80);
    expect(resolveCleanThresholdGb({ STORAGE_CLEAN_THRESHOLD_GB: "" })).toBe(80);
  });

  it("bajo umbral no selecciona nada aunque haya huérfanos elegibles", () => {
    const orphans = selectOrphans([nuncaEnviado("file-basura", 40)], new Set(), 30, AHORA);
    expect(orphans).toHaveLength(1);
    const plan = planStorageCleanup({
      orphans,
      unregistered: [],
      usedBytes: 19e9,
      thresholdGb: 80,
      quotaGb: 100,
      listingFailed: false,
      classificationComplete: true,
    });
    expect(plan.mode).toBe("report");
    expect(plan.deleteOrphans).toEqual([]);
    expect(plan.willDelete).toBe(false);
  });

  it("sobre umbral selecciona solo huérfanos never-sent (no biblioteca)", () => {
    const lote = [
      enviado("file-biblioteca", 400),
      nuncaEnviado("file-referenciado", 400),
      nuncaEnviado("file-basura", 400),
      nuncaEnviado("file-reciente", 3),
    ];
    const orphans = selectOrphans(lote, new Set(["file-referenciado"]), 30, AHORA);
    expect(ids(orphans)).toEqual(["file-basura"]);
    const plan = planStorageCleanup({
      orphans,
      unregistered: [{ name: "u/abandonado.bin", bytes: 10 }],
      usedBytes: 90e9,
      thresholdGb: 80,
      quotaGb: 100,
      listingFailed: false,
      classificationComplete: true,
    });
    expect(plan.mode).toBe("delete");
    expect(ids(plan.deleteOrphans)).toEqual(["file-basura"]);
    expect(plan.deleteUnregistered.map((b) => b.name)).toEqual(["u/abandonado.bin"]);
  });

  it("si no se pudieron leer messages, no borra huérfanos registrados", () => {
    const orphans = selectOrphans([nuncaEnviado("file-basura", 40)], new Set(), 30, AHORA);
    const plan = planStorageCleanup({
      orphans,
      unregistered: [],
      usedBytes: 90e9,
      thresholdGb: 80,
      quotaGb: 100,
      listingFailed: false,
      classificationComplete: false,
    });
    expect(plan.deleteOrphans).toEqual([]);
    expect(plan.skippedUnclassified).toBe(true);
    expect(plan.willDelete).toBe(false);
  });

  it("el markdown dice si solo informó o si borró", () => {
    const report = formatCleanupMarkdown(
      {
        mode: "report",
        overThreshold: false,
        willDelete: false,
        deleteOrphans: [],
        deleteUnregistered: [],
        skippedUnclassified: false,
        listingFailed: false,
        usedBytes: 19e9,
        thresholdGb: 80,
        quotaGb: 100,
        orphanCount: 2,
        unregisteredCount: 1,
      },
      { orphanBytes: 5e6, unregisteredBytes: 1e6, deleted: { orphans: 0, unregistered: 0 } }
    );
    expect(report).toContain("solo informe (dry-run)");
    expect(report).toContain("19.00 GB");
    expect(report).toContain("Umbral de auto-limpieza: 80 GB");
    expect(report).toContain("Nunca se borra");
    expect(report).not.toContain("borró candidatos");
  });
});

describe("formatBytes / summarizeBytes", () => {
  it("habla en GB de dashboard (base 10)", () => {
    expect(formatBytes(1.5e9)).toBe("1.50 GB");
    expect(formatBytes(1280000)).toBe("1.3 MB");
    expect(formatBytes(Number.NaN)).toBe("tamaño desconocido");
  });

  it("no inventa un promedio cuando faltan tamaños", () => {
    expect(
      summarizeBytes([{ bytes: 100 }, { bytes: null }, { bytes: 50 }])
    ).toEqual({ count: 3, known: 2, unknown: 1, knownBytes: 150 });
  });
});
