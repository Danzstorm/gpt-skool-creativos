import { describe, expect, it } from "vitest";
import { threadAttachmentLabels, threadFileIds } from "./message-attachments";

describe("threadFileIds", () => {
  it("collects unique openai_file_id across messages", () => {
    const messages = [
      { files: [{ openai_file_id: "a" }, { openai_file_id: "b" }] },
      { files: [{ openai_file_id: "b" }] },
    ];
    expect(threadFileIds(messages)).toEqual(["a", "b"]);
  });

  it("ignores messages without files", () => {
    expect(threadFileIds([{ files: null }, { files: undefined }])).toEqual([]);
  });

  it("ignores malformed entries instead of throwing", () => {
    const messages = [{ files: [null, "not-an-object", { name: "no id here" }, { openai_file_id: 42 }] }];
    expect(threadFileIds(messages)).toEqual([]);
  });

  it("returns [] for an empty thread", () => {
    expect(threadFileIds([])).toEqual([]);
  });
});

describe("threadAttachmentLabels", () => {
  const msg = (files: unknown) => ({ files });

  it("nombra cada imagen como la nombra el modelo, por mensaje", () => {
    const labels = threadAttachmentLabels([
      msg([
        { openai_file_id: "a", type: "image" },
        { openai_file_id: "b", type: "document" },
        { openai_file_id: "c", type: "image" },
      ]),
    ]);

    // El documento del medio no corre la numeración: son 1 y 2, no 1 y 3.
    expect(labels.get("a")).toBe("imagen 1");
    expect(labels.get("c")).toBe("imagen 2");
    expect(labels.has("b")).toBe(false);
  });

  it("numera los videos aparte de las imágenes", () => {
    const labels = threadAttachmentLabels([
      msg([
        { openai_file_id: "i", type: "image" },
        { openai_file_id: "v", type: "video" },
      ]),
    ]);

    expect(labels.get("i")).toBe("imagen 1");
    expect(labels.get("v")).toBe("descripción de video 1");
  });

  it("la numeración NO se reinicia entre mensajes", () => {
    // EL PUNTO DEL CAMBIO. Antes se contaba por mensaje, así que en un chat con
    // varias tandas de imágenes había tres "imagen 1" distintas y pedir "usá la
    // imagen 1" no identificaba ninguna. El número viaja guardado con el
    // archivo, así que el menú repite lo que escuchó el modelo.
    const labels = threadAttachmentLabels([
      msg([{ openai_file_id: "a", type: "image", n: 1 }]),
      msg([{ openai_file_id: "b", type: "image", n: 2 }]),
      msg([
        { openai_file_id: "c", type: "image", n: 3 },
        { openai_file_id: "d", type: "image", n: 4 },
      ]),
    ]);

    expect(labels.get("a")).toBe("imagen 1");
    expect(labels.get("b")).toBe("imagen 2");
    expect(labels.get("c")).toBe("imagen 3");
    expect(labels.get("d")).toBe("imagen 4");
    expect(new Set(labels.values()).size).toBe(4); // ninguno se repite
  });

  it("en un hilo viejo muestra el rótulo que el modelo realmente escuchó", () => {
    // Sin `n` guardado, el menú NO puede inventar una numeración corrida: el
    // historial en OpenAI lleva la vieja y no se puede reescribir. Mostrar otra
    // cosa sería ofrecer una referencia que el modelo no resuelve.
    const labels = threadAttachmentLabels([
      msg([{ openai_file_id: "a", type: "image" }]),
      msg([{ openai_file_id: "b", type: "image" }]),
    ]);

    expect(labels.get("a")).toBe("imagen 1");
    expect(labels.get("b")).toBe("imagen 1");
  });

  it("un archivo re-adjuntado conserva el rótulo de su primer envío", () => {
    const labels = threadAttachmentLabels([
      msg([{ openai_file_id: "x", type: "image", n: 1 }]),
      msg([
        { openai_file_id: "nuevo", type: "image", n: 2 },
        { openai_file_id: "x", type: "image", n: 1 },
      ]),
    ]);

    expect(labels.get("x")).toBe("imagen 1");
  });

  it("aguanta basura sin romperse", () => {
    expect(threadAttachmentLabels([msg(null), msg("nope"), msg([null, 7])]).size).toBe(0);
  });
});
