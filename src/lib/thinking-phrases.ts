// Qué mostrar mientras el asistente trabaja y todavía no llegó ni un token.
//
// La regla que ordena todo este archivo: NUNCA se afirma algo que no ocurrió.
// Hay dos clases de frase y no se mezclan.
//
//   - Las de FASE son literales y describen un hecho comprobable: el servidor
//     mandó `response.code_interpreter_call.in_progress`, o el propio cliente
//     adjuntó tres imágenes. Se dicen tal cual.
//   - Las de RELLENO son decorativas y solo aparecen cuando no hay nada
//     concreto que contar. Ahí sí va el guiño de oficio, en una sola palabra.
//
// Vestir de metáfora un hecho verificable es donde este tipo de copy se vuelve
// molesto, así que "Ejecutando código" se dice tal cual aunque sea más largo
// que una palabra suelta: ahí la información vale más que la simetría.

/** Fases que informa el servidor por el stream SSE. */
export type Phase = "queued" | "thinking" | "code";

/** Lo que el cliente sabe del mensaje que acaba de mandar. */
export interface ThinkingAttachments {
  images: number;
  documents: number;
}

export const EMPTY_ATTACHMENTS: ThinkingAttachments = { images: 0, documents: 0 };

/**
 * Cuenta los adjuntos del mensaje de usuario que provocó la espera.
 *
 * Recibe una forma estructural en vez de importar `Message` para que este
 * módulo siga sin depender de los tipos de la app y se pueda testear con
 * objetos literales.
 */
export function countAttachments(
  message?: { files?: { type: "image" | "document" }[] } | null
): ThinkingAttachments {
  const files = message?.files;
  if (!files || files.length === 0) return EMPTY_ATTACHMENTS;
  return {
    images: files.filter((f) => f.type === "image").length,
    documents: files.filter((f) => f.type === "document").length,
  };
}

/**
 * Relleno para cuando no hay fase concreta: UNA palabra, gerundio, del oficio
 * de la comunidad — cine, foto, diseño y escritura de prompts.
 *
 * Por qué una lista estática y no generada con un modelo: este indicador existe
 * para que la espera no se sienta muerta, así que tiene que aparecer en el
 * mismo frame en que se manda el mensaje. Pedirle la palabra a un modelo suma
 * entre 300ms y 2s ANTES de poder mostrar nada — se estaría esperando para
 * mostrar lo que sirve para amenizar la espera. Además sería una llamada extra
 * por mensaje contra la cuenta del cliente, y algo intesteable. La variedad se
 * consigue con una lista larga y un punto de arranque distinto por turno.
 *
 * Vive en un único array exportado a propósito. Cambiar el tono es editar esta
 * lista, no perseguir literales por los componentes.
 */
export const FILLER_PHRASES = [
  "Pensando",
  "Ideando",
  "Imaginando",
  "Creando",
  "Generando",
  "Prompteando",
  "Componiendo",
  "Encuadrando",
  "Iluminando",
  "Revelando",
  "Bocetando",
  "Esbozando",
  "Puliendo",
  "Afinando",
  "Montando",
  "Editando",
  "Dirigiendo",
  "Guionando",
  "Maquetando",
  "Renderizando",
  "Diseñando",
  "Perfilando",
  "Coloreando",
  "Ensamblando",
  "Narrando",
  "Rodando",
  "Enfocando",
  "Calibrando",
  "Retocando",
  "Tramando",
] as const;

/** Cada cuánto avanza el relleno. */
export const FILLER_ROTATION_MS = 4000;

const PHASE_PHRASES: Record<Exclude<Phase, "thinking">, string> = {
  queued: "En cola",
  code: "Ejecutando código",
};

function attachmentPhrase(attachments: ThinkingAttachments): string | null {
  // Las imágenes pesan más que los documentos: son las que hacen lento el turno
  // (y las que provocaban el timeout que originó todo esto), así que si el
  // mensaje lleva las dos cosas, se nombra la que explica la espera.
  if (attachments.images > 0) {
    return attachments.images === 1 ? "Mirando tu imagen" : "Mirando tus imágenes";
  }
  if (attachments.documents > 0) {
    return attachments.documents === 1 ? "Leyendo tu documento" : "Leyendo tus documentos";
  }
  return null;
}

/**
 * Frase a mostrar. Función pura: mismo input, misma salida — sin `Date.now()`
 * ni `Math.random()` adentro. Por eso el tiempo entra como argumento y la
 * rotación es determinista: una rotación al azar puede repetir la misma frase
 * dos veces seguidas y se ve congelada, además de ser intesteable.
 *
 * Orden de prioridad:
 *   1. Fase informada por el servidor (es lo que de verdad está pasando).
 *   2. Adjuntos que conoce el cliente (también es real, solo que local).
 *   3. Relleno rotativo.
 */
export function phraseFor(
  phase: Phase,
  attachments: ThinkingAttachments,
  elapsedMs: number,
  seed = 0
): string {
  const fromPhase = phase !== "thinking" ? PHASE_PHRASES[phase] : undefined;
  if (fromPhase) return fromPhase;

  const fromAttachments = attachmentPhrase(attachments);
  if (fromAttachments) return fromAttachments;

  // La variedad sale de arrancar en un punto distinto en cada turno, no de
  // sortear una palabra en cada tick: sorteando, la misma puede salir dos veces
  // seguidas y el indicador se ve congelado justo cuando tiene que verse vivo.
  // Avanzando desde un arranque aleatorio no hay repetición posible hasta dar
  // la vuelta entera.
  //
  // `seed` entra como argumento en vez de leer Math.random() acá adentro para
  // que la función siga siendo pura y testeable. El llamador usa el timestamp
  // de inicio del turno, que ya es distinto en cada uno.
  const step = Math.floor(Math.max(0, elapsedMs) / FILLER_ROTATION_MS);
  const offset = Math.abs(Math.trunc(seed)) % FILLER_PHRASES.length;
  // Cicla en vez de quedarse en la última: con treinta palabras equivalentes
  // dar la vuelta lleva dos minutos, más que cualquier turno real, y ninguna
  // sugiere más progreso que otra. La lista anterior sí era una secuencia
  // narrativa y por eso ahí sí había que frenar en la última.
  const index = (offset + step) % FILLER_PHRASES.length;
  return FILLER_PHRASES[index];
}
