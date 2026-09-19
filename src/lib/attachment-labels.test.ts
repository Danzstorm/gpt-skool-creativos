import { describe, expect, it } from "vitest";
import {
  assignThreadNumbers,
  documentLabel,
  documentMention,
  imageLabel,
  imageMention,
  videoLabel,
  videoMention,
} from "./attachment-labels";

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

describe("documentLabel", () => {
  it("nombra el documento cuando el menú @ le asigna número", () => {
    expect(documentLabel(1)).toBe("archivo 1");
  });
});

describe("tokens @ del composer", () => {
  it("el chip es @Imagen N, el modelo sigue leyendo imagen N", () => {
    expect(imageMention(4)).toBe("@Imagen 4");
    expect(imageLabel(4)).toBe("imagen 4");
    expect(videoMention(1)).toBe("@Video 1");
    expect(documentMention(2)).toBe("@Archivo 2");
  });
});

describe("assignThreadNumbers", () => {
  const msg = (files: unknown) => ({ files });
  const img = (id: string, n?: number) => ({ openai_file_id: id, type: "image" as const, ...(n ? { n } : {}) });
  const vid = (id: string, n?: number) => ({ openai_file_id: id, type: "video" as const, ...(n ? { n } : {}) });

  it("los archivos nuevos se numeran corridos a lo largo del hilo", () => {
    // Lo que se manda hoy queda con su número guardado, así que el hilo se lee
    // tal como el modelo lo escuchó.
    const { images } = assignThreadNumbers([
      msg([img("a", 1), img("b", 2)]),
      msg([img("c", 3)]),
    ]);

    expect([...images]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("un archivo re-adjuntado conserva su número", () => {
    // Es lo que hace que referenciar funcione: si al volver a mandar la imagen
    // 1 esta pasara a ser la 3, el número dejaría de señalar algo estable.
    const { images } = assignThreadNumbers([
      msg([img("a", 1), img("b", 2)]),
      msg([img("a", 1)]),
    ]);

    expect(images.get("a")).toBe(1);
    expect(images.size).toBe(2);
  });

  it("los archivos del mensaje saliente toman los números siguientes", () => {
    const { images } = assignThreadNumbers([msg([img("a", 1)])], [img("b")]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
  });

  it("lo mandado ANTES de guardar el número conserva la cuenta por mensaje", () => {
    // El historial del modelo vive en OpenAI y no se puede reescribir: para esos
    // archivos la numeración por mensaje es la única que coincide con lo que
    // realmente escuchó. Inventarles un número nuevo haría que el menú prometa
    // una referencia que el modelo no puede resolver.
    const { images } = assignThreadNumbers([
      msg([img("a"), img("b")]),
      msg([img("c")]),
    ]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
    expect(images.get("c")).toBe(1); // se reinicia, como se le dijo al modelo
  });

  it("un número nuevo nunca choca con uno heredado", () => {
    // Hilo viejo con dos "imagen 1" distintas. Lo que se mande ahora tiene que
    // caer por encima de todo lo ya usado.
    const { images } = assignThreadNumbers(
      [msg([img("a"), img("b")]), msg([img("c")])],
      [img("nuevo")]
    );

    const usados = [...images.values()];
    expect(images.get("nuevo")).toBe(4); // 3 archivos en el hilo, arranca en 4
    expect(usados.filter((n) => n === images.get("nuevo"))).toHaveLength(1);
  });

  it("videos e imágenes se cuentan aparte", () => {
    const { images, videos } = assignThreadNumbers([
      msg([img("i1", 1), vid("v1", 1)]),
      msg([vid("v2", 2), img("i2", 2)]),
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

  it("ignora un n corrupto y vuelve a la cuenta por mensaje", () => {
    const { images } = assignThreadNumbers([
      msg([
        { openai_file_id: "a", type: "image", n: "dos" },
        { openai_file_id: "b", type: "image", n: -4 },
      ]),
    ]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
  });

  it("replaceLast: sin el mensaje borrado, los salientes siguen la secuencia", () => {
    // Editar el último turno borra ese mensaje antes de numerar; lo que queda
    // del hilo más los archivos nuevos deben continuar la cuenta.
    const { images } = assignThreadNumbers([msg([img("a", 1), img("b", 2)])], [img("c")]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
    expect(images.get("c")).toBe(3);
  });

  it("regenerar: el turno user guardado ya está en la historia", () => {
    const { images } = assignThreadNumbers([msg([img("a", 1), img("b", 2)])]);

    expect(images.get("a")).toBe(1);
    expect(images.get("b")).toBe(2);
    expect(images.size).toBe(2);
  });

  it("aguanta filas sin adjuntos y basura de la base", () => {
    const { images } = assignThreadNumbers([
      {},
      msg(null),
      msg("nope"),
      msg([null, 7, { type: "image" }]),
      msg([img("a", 9)]),
    ]);

    expect(images.get("a")).toBe(9);
    expect(images.size).toBe(1);
  });
});
