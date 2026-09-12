import { describe, expect, it } from "vitest";
import { assignThreadNumbers, imageLabel, videoLabel } from "./attachment-labels";

describe("imageLabel", () => {
  it("es el nombre que se usa en pantalla y para el modelo", () => {
    // Un solo formato para los dos lados. Si la insignia dijera "img 1" y el
    // modelo "imagen 1", el usuario dudaría de si hablan de la misma foto.
    expect(imageLabel(1)).toBe("imagen 1");
    expect(imageLabel(12)).toBe("imagen 12");
  });
});

describe("videoLabel", () => {
  it("es el nombre que se usa en pantalla y para el modelo", () => {
    expect(videoLabel(1)).toBe("descripción de video 1");
  });
});

describe("assignThreadNumbers", () => {
  const msg = (files: unknown) => ({ files });
  const img = (id: string) => ({ openai_file_id: id, type: "image" as const });

  it("numera a lo largo de todo el hilo, sin reiniciar por mensaje", () => {
    const { images } = assignThreadNumbers([
      msg([img("a"), img("b")]),
      msg([img("c")]),
    ]);

    expect([...images]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("un archivo re-adjuntado conserva su número, no recibe uno nuevo", () => {
    // Es lo que hace que referenciar funcione: si al volver a mandar la imagen
    // 1 esta pasara a ser la 4, el número dejaría de señalar algo estable.
    const { images } = assignThreadNumbers([
      msg([img("a"), img("b")]),
      msg([img("a")]),
    ]);

    expect(images.get("a")).toBe(1);
    expect(images.size).toBe(2);
  });

  it("los archivos del mensaje saliente toman los números siguientes", () => {
    const { images } = assignThreadNumbers([msg([img("a")])], [img("b")]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
  });

  it("videos e imágenes se cuentan aparte", () => {
    const { images, videos } = assignThreadNumbers([
      msg([img("i1"), { openai_file_id: "v1", type: "video" }]),
      msg([{ openai_file_id: "v2", type: "video" }, img("i2")]),
    ]);

    expect(images.get("i1")).toBe(1);
    expect(images.get("i2")).toBe(2);
    expect(videos.get("v1")).toBe(1);
    expect(videos.get("v2")).toBe(2);
  });

  it("los documentos no entran en ninguna cuenta", () => {
    const { images, videos } = assignThreadNumbers([
      msg([{ openai_file_id: "d", type: "document" }, img("a")]),
    ]);

    expect(images.get("a")).toBe(1); // el documento no corrió la numeración
    expect(images.has("d")).toBe(false);
    expect(videos.size).toBe(0);
  });

  it("aguanta filas sin adjuntos y basura de la base", () => {
    const { images } = assignThreadNumbers([
      {},
      msg(null),
      msg("nope"),
      msg([null, 7, { type: "image" }]),
      msg([img("a")]),
    ]);

    expect(images.get("a")).toBe(1);
    expect(images.size).toBe(1);
  });
});
