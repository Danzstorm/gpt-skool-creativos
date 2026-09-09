import { describe, expect, it } from "vitest";
import {
  countAttachments,
  EMPTY_ATTACHMENTS,
  FILLER_PHRASES,
  FILLER_ROTATION_MS,
  phraseFor,
  type Phase,
  type ThinkingAttachments,
} from "./thinking-phrases";

const SIN_ADJUNTOS: ThinkingAttachments = { images: 0, documents: 0 };

describe("phraseFor — prioridad entre fuentes", () => {
  it("la fase del servidor pisa a lo que sabe el cliente", () => {
    // Si el modelo empezó a ejecutar código, eso es más informativo que
    // recordarle al usuario que adjuntó una imagen hace diez segundos.
    expect(phraseFor("code", { images: 3, documents: 0 }, 0)).toBe("Ejecutando código");
  });

  it("los adjuntos pisan al relleno", () => {
    expect(phraseFor("thinking", { images: 1, documents: 0 }, 0)).toBe("Mirando tu imagen");
    expect(phraseFor("thinking", SIN_ADJUNTOS, 0)).toBe(FILLER_PHRASES[0]);
  });

  it("nombra las imágenes antes que los documentos cuando hay de las dos", () => {
    // Las imágenes son las que hacen lento el turno: son las que explican
    // la espera que el usuario está mirando.
    expect(phraseFor("thinking", { images: 1, documents: 2 }, 0)).toBe("Mirando tu imagen");
  });

  it("una fase que no conoce no rompe: cae al relleno", () => {
    // El servidor podría empezar a mandar una fase nueva antes de que el
    // cliente la conozca (un deploy va antes que el otro).
    const desconocida = "transcribiendo" as Phase;
    expect(phraseFor(desconocida, SIN_ADJUNTOS, 0)).toBe(FILLER_PHRASES[0]);
  });
});

describe("phraseFor — singular y plural", () => {
  it("distingue una imagen de varias", () => {
    expect(phraseFor("thinking", { images: 1, documents: 0 }, 0)).toBe("Mirando tu imagen");
    expect(phraseFor("thinking", { images: 2, documents: 0 }, 0)).toBe("Mirando tus imágenes");
  });

  it("distingue un documento de varios", () => {
    expect(phraseFor("thinking", { images: 0, documents: 1 }, 0)).toBe("Leyendo tu documento");
    expect(phraseFor("thinking", { images: 0, documents: 5 }, 0)).toBe("Leyendo tus documentos");
  });
});

describe("phraseFor — el relleno es una sola palabra", () => {
  it("ninguna palabra de relleno lleva espacios ni puntos suspensivos", () => {
    // El pedido explícito fue una palabra suelta en lugar de los tres puntos.
    // Si alguien agrega "Puliendo los detalles…" a la lista, esto lo frena.
    for (const palabra of FILLER_PHRASES) {
      expect(palabra).not.toContain(" ");
      expect(palabra).not.toContain("…");
    }
  });

  it("no hay palabras repetidas en la lista", () => {
    // Un duplicado rompe la promesa de no repetir hasta dar la vuelta entera.
    expect(new Set(FILLER_PHRASES).size).toBe(FILLER_PHRASES.length);
  });
});

describe("phraseFor — rotación del relleno", () => {
  it("avanza una palabra por ventana de rotación", () => {
    for (let i = 0; i < FILLER_PHRASES.length; i++) {
      const dentroDeLaVentana = i * FILLER_ROTATION_MS + 1;
      expect(phraseFor("thinking", SIN_ADJUNTOS, dentroDeLaVentana, 0)).toBe(FILLER_PHRASES[i]);
    }
  });

  it("nunca repite dos veces seguidas mientras no dé la vuelta entera", () => {
    // Es la razón de avanzar desde un arranque aleatorio en vez de sortear en
    // cada tick: un sorteo puede sacar la misma palabra dos veces y el
    // indicador se ve congelado justo cuando tiene que verse vivo.
    const vistas: string[] = [];
    for (let i = 0; i < FILLER_PHRASES.length; i++) {
      vistas.push(phraseFor("thinking", SIN_ADJUNTOS, i * FILLER_ROTATION_MS, 7));
    }
    expect(new Set(vistas).size).toBe(FILLER_PHRASES.length);
  });

  it("cicla al dar la vuelta en vez de quedarse trabado", () => {
    const unaVuelta = FILLER_PHRASES.length * FILLER_ROTATION_MS;
    expect(phraseFor("thinking", SIN_ADJUNTOS, unaVuelta, 3)).toBe(
      phraseFor("thinking", SIN_ADJUNTOS, 0, 3)
    );
  });

  it("semillas distintas arrancan en palabras distintas", () => {
    // Es lo que hace que dos mensajes seguidos no se vean iguales.
    const arranques = new Set(
      [0, 1, 2, 3, 4].map((seed) => phraseFor("thinking", SIN_ADJUNTOS, 0, seed))
    );
    expect(arranques.size).toBe(5);
  });

  it("es determinista: mismo tiempo y misma semilla dan la misma palabra", () => {
    // Sin esto no se puede ni testear ni razonar sobre lo que ve el usuario.
    const t = FILLER_ROTATION_MS * 2 + 500;
    expect(phraseFor("thinking", SIN_ADJUNTOS, t, 42)).toBe(
      phraseFor("thinking", SIN_ADJUNTOS, t, 42)
    );
  });

  it("tolera tiempo negativo y semillas raras sin salirse del array", () => {
    // Un reloj que corrige hacia atrás, o un timestamp enorme como semilla,
    // no pueden devolver undefined.
    expect(FILLER_PHRASES).toContain(phraseFor("thinking", SIN_ADJUNTOS, -5000, 0));
    expect(FILLER_PHRASES).toContain(phraseFor("thinking", SIN_ADJUNTOS, 0, -1));
    expect(FILLER_PHRASES).toContain(phraseFor("thinking", SIN_ADJUNTOS, 0, Date.now()));
    expect(FILLER_PHRASES).toContain(phraseFor("thinking", SIN_ADJUNTOS, 0, 1.5));
  });
});

describe("phraseFor — fases del servidor", () => {
  it("traduce cada fase conocida", () => {
    expect(phraseFor("queued", SIN_ADJUNTOS, 0)).toBe("En cola");
    expect(phraseFor("code", SIN_ADJUNTOS, 0)).toBe("Ejecutando código");
  });

  it("las frases de fase son literales, sin metáfora", () => {
    // Es la regla que sostiene la honestidad del indicador: el guiño va solo
    // en el relleno. Si alguien "mejora" el copy de una fase, esto lo frena.
    const deFase = [phraseFor("queued", SIN_ADJUNTOS, 0), phraseFor("code", SIN_ADJUNTOS, 0)];
    for (const frase of deFase) {
      expect(FILLER_PHRASES).not.toContain(frase);
    }
  });
});

describe("countAttachments", () => {
  it("cuenta imágenes y documentos por separado", () => {
    const message = {
      files: [
        { type: "image" as const },
        { type: "image" as const },
        { type: "document" as const },
      ],
    };
    expect(countAttachments(message)).toEqual({ images: 2, documents: 1 });
  });

  it("no cuenta videos como imagen ni como documento", () => {
    // El video ya es texto (descripción de Gemini) para cuando llega acá —
    // no hay una espera propia que anunciar, así que cae al relleno rotativo.
    expect(countAttachments({ files: [{ type: "video" as const }] })).toEqual(EMPTY_ATTACHMENTS);
  });

  it("devuelve vacío cuando no hay mensaje o no hay adjuntos", () => {
    // El primer turno de una conversación no tiene mensaje anterior, así que
    // esto se llama con undefined en cada chat nuevo.
    expect(countAttachments(undefined)).toEqual(EMPTY_ATTACHMENTS);
    expect(countAttachments(null)).toEqual(EMPTY_ATTACHMENTS);
    expect(countAttachments({})).toEqual(EMPTY_ATTACHMENTS);
    expect(countAttachments({ files: [] })).toEqual(EMPTY_ATTACHMENTS);
  });

  it("encadena con phraseFor: un mensaje con dos imágenes da el plural", () => {
    const attachments = countAttachments({
      files: [{ type: "image" as const }, { type: "image" as const }],
    });
    expect(phraseFor("thinking", attachments, 0)).toBe("Mirando tus imágenes");
  });
});
