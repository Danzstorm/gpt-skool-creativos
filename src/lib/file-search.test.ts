import { describe, expect, it } from "vitest";
import { filterByName, mentionAt, moveIndex, normalize, removeMention } from "./file-search";

describe("mentionAt — cuándo se abre el menú", () => {
  it("se abre con @ al principio del texto", () => {
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("@bri", 4)).toEqual({ start: 0, query: "bri" });
  });

  it("se abre con @ después de un espacio", () => {
    expect(mentionAt("mirá @bri", 9)).toEqual({ start: 5, query: "bri" });
  });

  it("NO se abre dentro de un correo", () => {
    // El falso positivo que más molesta, porque pasa escribiendo texto normal.
    expect(mentionAt("hola@ejemplo.com", 16)).toBeNull();
    expect(mentionAt("hola@", 5)).toBeNull();
  });

  it("se cierra al escribir un espacio", () => {
    // Sin esto el menú queda abierto para siempre después del primer @.
    expect(mentionAt("@brief final", 12)).toBeNull();
  });

  it("no se abre si no hay @ antes del cursor", () => {
    expect(mentionAt("sin menciones", 5)).toBeNull();
    // El @ está DESPUÉS del cursor: todavía no lo escribió acá.
    expect(mentionAt("hola @brief", 4)).toBeNull();
  });

  it("toma la mención más cercana al cursor cuando hay varias", () => {
    expect(mentionAt("@uno @dos", 9)).toEqual({ start: 5, query: "dos" });
  });

  it("trata el salto de línea como separador, igual que el espacio", () => {
    expect(mentionAt("linea\n@bri", 10)).toEqual({ start: 6, query: "bri" });
  });
});

describe("removeMention", () => {
  it("borra la mención y deja el cursor en su lugar", () => {
    const text = "mirá @brief";
    const mention = mentionAt(text, text.length)!;
    expect(removeMention(text, mention, text.length)).toEqual({ text: "mirá ", caret: 5 });
  });

  it("conserva lo que hay después del cursor", () => {
    // Se puede escribir la mención en medio de una frase ya escrita.
    const text = "mirá @bri y decime";
    const mention = mentionAt(text, 9)!;
    expect(removeMention(text, mention, 9)).toEqual({ text: "mirá  y decime", caret: 5 });
  });
});

describe("normalize y filterByName", () => {
  const files = [
    { name: "Referencia-Luz.JPG" },
    { name: "brief-2026.pdf" },
    { name: "IMG_2039.jpg" },
  ];

  it("ignora mayúsculas", () => {
    expect(filterByName(files, "referencia")).toEqual([{ name: "Referencia-Luz.JPG" }]);
  });

  it("ignora acentos en los dos sentidos", () => {
    // Alguien escribe "referéncia" con acento, o el archivo lo tiene y la
    // búsqueda no. Los dos casos tienen que encontrar.
    expect(normalize("Referéncia")).toBe("referencia");
    expect(filterByName([{ name: "Reseña Fotográfica.png" }], "resena")).toHaveLength(1);
    expect(filterByName([{ name: "Resena.png" }], "reseña")).toHaveLength(1);
  });

  it("trata la ñ como n, a propósito", () => {
    // NFD descompone la ñ en n + tilde combinante, y el filtro descarta la
    // tilde. Lingüísticamente son letras distintas, pero en un buscador de
    // archivos conviene perdonar: quien teclea "diseno" apurado tiene que
    // encontrar "diseño". El precio es que "año" y "ano" empatan, que en
    // nombres de archivo no molesta a nadie.
    expect(normalize("diseño")).toBe("diseno");
    expect(filterByName([{ name: "diseño-final.pdf" }], "diseno")).toHaveLength(1);
  });

  it("con la consulta vacía devuelve todo", () => {
    // Es el estado inicial: se escribe @ y todavía no se filtró nada.
    expect(filterByName(files, "")).toHaveLength(3);
    expect(filterByName(files, "   ")).toHaveLength(3);
  });

  it("no encuentra nada cuando no hay coincidencia", () => {
    expect(filterByName(files, "zzz")).toEqual([]);
  });
});

describe("moveIndex — navegación con flechas", () => {
  it("avanza y retrocede", () => {
    expect(moveIndex(0, 1, 3)).toBe(1);
    expect(moveIndex(1, -1, 3)).toBe(0);
  });

  it("da la vuelta en los dos extremos", () => {
    // Sin wrap, mantener la flecha apretada se traba en el último y parece
    // que el menú se colgó.
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(0, -1, 3)).toBe(2);
  });

  it("no rompe con la lista vacía", () => {
    // Pasa mientras se escribe una consulta que no encuentra nada.
    expect(moveIndex(0, 1, 0)).toBe(0);
    expect(moveIndex(3, -1, 0)).toBe(0);
  });
});
