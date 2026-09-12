import { describe, it, expect } from "vitest";
import { matchLibraryRows, type UploadedRow } from "./file-library";

const row = (over: Partial<UploadedRow> & { openai_file_id: string }): UploadedRow => ({
  name: null,
  mime: null,
  storage_path: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

const imagen = (id: string, name: string) =>
  row({ openai_file_id: id, name, mime: "image/png", storage_path: `p/${id}` });

describe("matchLibraryRows", () => {
  it("muestra el rótulo del modelo, no el nombre del dispositivo", () => {
    // EL BUG: el menú listaba "IMG_2039.jpg", que es justo el nombre que el
    // modelo nunca ve. Pedir "usá IMG_2039" no podía funcionar.
    const labels = new Map([["f1", "imagen 2"]]);
    const [entry] = matchLibraryRows([imagen("f1", "IMG_2039.jpg")], labels, "");

    expect(entry.base.label).toBe("imagen 2");
    expect(entry.base.name).toBe("IMG_2039.jpg"); // se conserva, pero no es lo que se muestra
  });

  it("encuentra una imagen buscando por su rótulo", () => {
    // Sin esto el arreglo se muerde la cola: el menú diría "imagen 2" y
    // escribir `@imagen` no devolvería nada.
    const labels = new Map([["f1", "imagen 2"]]);
    const hits = matchLibraryRows([imagen("f1", "IMG_2039.jpg")], labels, "imagen");

    expect(hits).toHaveLength(1);
    expect(hits[0].base.openai_file_id).toBe("f1");
  });

  it("sigue encontrando por el nombre real", () => {
    const hits = matchLibraryRows([imagen("f1", "logo-final.png")], new Map(), "logo");
    expect(hits).toHaveLength(1);
  });

  it("ignora acentos y mayúsculas en los dos lados", () => {
    // El `ilike` de Postgres ignoraba mayúsculas pero no acentos: "resena" no
    // encontraba "Reseña". Filtrando en memoria sale gratis.
    const docs = [row({ openai_file_id: "d1", name: "Reseña Final.PDF", mime: "application/pdf" })];
    expect(matchLibraryRows(docs, new Map(), "resena")).toHaveLength(1);
    expect(matchLibraryRows(docs, new Map(), "RESEÑA")).toHaveLength(1);
  });

  it("los documentos no llevan rótulo: su nombre real es información", () => {
    const labels = new Map([["d1", "imagen 1"]]); // rótulo espurio a propósito
    const [entry] = matchLibraryRows(
      [row({ openai_file_id: "d1", name: "brief.pdf", mime: "application/pdf" })],
      labels,
      ""
    );

    expect(entry.base.type).toBe("document");
    expect(entry.base.label).toBeUndefined();
  });

  it("una consulta vacía devuelve todo: es el estado al abrir el menú", () => {
    const rows = [imagen("f1", "a.png"), imagen("f2", "b.png")];
    expect(matchLibraryRows(rows, new Map(), "")).toHaveLength(2);
    expect(matchLibraryRows(rows, new Map(), "   ")).toHaveLength(2);
  });

  it("un archivo sin nombre cae a un genérico según su tipo", () => {
    const rows = [
      row({ openai_file_id: "i", mime: "image/png" }),
      row({ openai_file_id: "v", mime: "video/mp4" }),
      row({ openai_file_id: "d", mime: "application/pdf" }),
    ];
    expect(matchLibraryRows(rows, new Map(), "").map((e) => e.base.name)).toEqual([
      "imagen",
      "video",
      "archivo",
    ]);
  });

  it("devuelve la fila junto a la entrada, para firmar la miniatura sin rebuscar", () => {
    const [entry] = matchLibraryRows([imagen("f1", "a.png")], new Map(), "");
    expect(entry.row.storage_path).toBe("p/f1");
  });
});
