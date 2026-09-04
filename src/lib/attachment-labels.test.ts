import { describe, expect, it } from "vitest";
import { imageLabel, imageNumber, type AttachmentLike } from "./attachment-labels";

const img: AttachmentLike = { type: "image" };
const doc: AttachmentLike = { type: "document" };

describe("imageNumber", () => {
  it("numera 1-based, no 0-based", () => {
    // Es lo que ve el usuario: la primera imagen es "imagen 1".
    expect(imageNumber([img], 0)).toBe(1);
  });

  it("cuenta solo imágenes, salteando los documentos", () => {
    // Con [doc, img, doc, img] las etiquetas son 1 y 2 — no 2 y 4. Al usuario
    // le da igual en qué posición del array quedaron los documentos.
    const files = [doc, img, doc, img];
    expect(imageNumber(files, 1)).toBe(1);
    expect(imageNumber(files, 3)).toBe(2);
  });

  it("devuelve null para un documento", () => {
    expect(imageNumber([img, doc], 1)).toBeNull();
  });

  it("devuelve null fuera de rango o con la lista vacía", () => {
    expect(imageNumber([], 0)).toBeNull();
    expect(imageNumber([img], 5)).toBeNull();
    expect(imageNumber([img], -1)).toBeNull();
  });

  it("coincide con el cálculo que ya hacía el composer", () => {
    // El composer contaba así (Composer.tsx:169). Este test es el que impide
    // que la UI y el modelo se separen: si alguien cambia la función y la
    // numeración deja de coincidir, el usuario vería "imagen 2" mientras el
    // modelo habla de otra.
    const files = [doc, img, img, doc, img];
    const comoLoHaciaElComposer = (i: number) =>
      files.filter((x, xi) => x.type === "image" && xi <= i).length;

    files.forEach((file, i) => {
      if (file.type !== "image") return;
      expect(imageNumber(files, i)).toBe(comoLoHaciaElComposer(i));
    });
  });
});

describe("imageLabel", () => {
  it("es el nombre que se usa en pantalla y para el modelo", () => {
    // Un solo formato para los dos lados. Si la insignia dijera "img 1" y el
    // modelo "imagen 1", el usuario dudaría de si hablan de la misma foto.
    expect(imageLabel(1)).toBe("imagen 1");
    expect(imageLabel(12)).toBe("imagen 12");
  });
});
