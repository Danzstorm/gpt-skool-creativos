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
    expect(phraseFor("code", { images: 3, documents: 0 }, 0)).toBe("Ejecutando código…");
  });

  it("los adjuntos pisan al relleno", () => {
    expect(phraseFor("thinking", { images: 1, documents: 0 }, 0)).toBe("Mirando tu imagen…");
    expect(phraseFor("thinking", SIN_ADJUNTOS, 0)).toBe(FILLER_PHRASES[0]);
  });

  it("nombra las imágenes antes que los documentos cuando hay de las dos", () => {
    // Las imágenes son las que hacen lento el turno: son las que explican
    // la espera que el usuario está mirando.
    expect(phraseFor("thinking", { images: 1, documents: 2 }, 0)).toBe("Mirando tu imagen…");
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
    expect(phraseFor("thinking", { images: 1, documents: 0 }, 0)).toBe("Mirando tu imagen…");
    expect(phraseFor("thinking", { images: 2, documents: 0 }, 0)).toBe("Mirando tus imágenes…");
  });

  it("distingue un documento de varios", () => {
    expect(phraseFor("thinking", { images: 0, documents: 1 }, 0)).toBe("Leyendo tu documento…");
    expect(phraseFor("thinking", { images: 0, documents: 5 }, 0)).toBe("Leyendo tus documentos…");
  });
});

describe("phraseFor — rotación del relleno", () => {
  it("avanza una frase por ventana de rotación", () => {
    for (let i = 0; i < FILLER_PHRASES.length; i++) {
      const dentroDeLaVentana = i * FILLER_ROTATION_MS + 1;
      expect(phraseFor("thinking", SIN_ADJUNTOS, dentroDeLaVentana)).toBe(FILLER_PHRASES[i]);
    }
  });

  it("se queda en la última y no vuelve a empezar", () => {
    // Reciclar la lista sugiere un progreso que no existe. A los dos minutos,
    // ver la primera frase otra vez delata que es decorado.
    const muchoDespues = FILLER_ROTATION_MS * (FILLER_PHRASES.length + 50);
    const ultima = FILLER_PHRASES[FILLER_PHRASES.length - 1];
    expect(phraseFor("thinking", SIN_ADJUNTOS, muchoDespues)).toBe(ultima);
    expect(phraseFor("thinking", SIN_ADJUNTOS, muchoDespues * 10)).toBe(ultima);
  });

  it("es determinista: el mismo tiempo da la misma frase", () => {
    // Sin esto no se puede ni testear ni razonar sobre lo que ve el usuario.
    const t = FILLER_ROTATION_MS * 2 + 500;
    expect(phraseFor("thinking", SIN_ADJUNTOS, t)).toBe(phraseFor("thinking", SIN_ADJUNTOS, t));
  });

  it("tolera un tiempo negativo sin salirse del array", () => {
    // Un reloj que corrige hacia atrás a mitad de espera no puede dar undefined.
    expect(phraseFor("thinking", SIN_ADJUNTOS, -5000)).toBe(FILLER_PHRASES[0]);
  });
});

describe("phraseFor — fases del servidor", () => {
  it("traduce cada fase conocida", () => {
    expect(phraseFor("queued", SIN_ADJUNTOS, 0)).toBe("En cola…");
    expect(phraseFor("code", SIN_ADJUNTOS, 0)).toBe("Ejecutando código…");
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
    expect(phraseFor("thinking", attachments, 0)).toBe("Mirando tus imágenes…");
  });
});
