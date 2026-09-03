// Qué mostrar mientras el asistente trabaja y todavía no llegó ni un token.
//
// La regla que ordena todo este archivo: NUNCA se afirma algo que no ocurrió.
// Hay dos clases de frase y no se mezclan.
//
//   - Las de FASE son literales y describen un hecho comprobable: el servidor
//     mandó `response.code_interpreter_call.in_progress`, o el propio cliente
//     adjuntó tres imágenes. Se dicen tal cual.
//   - Las de RELLENO son decorativas y solo aparecen cuando no hay nada
//     concreto que contar. Ahí sí va el guiño de oficio.
//
// Vestir de metáfora un hecho verificable es donde este tipo de copy se vuelve
// molesto, así que "Ejecutando código…" se queda como está.

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
 * Relleno para cuando no hay fase concreta. Vocabulario de cine y fotografía:
 * es el oficio de la comunidad y el tema de los GPTs (dirección de casting,
 * prompts de video).
 *
 * Vive en un único array exportado a propósito. Si dentro de un mes estas
 * frases cansan, cambiar el tono es editar estos cinco strings — no perseguir
 * literales por los componentes.
 */
export const FILLER_PHRASES = [
  "Afinando el lente…",
  "Buscando el encuadre…",
  "Montando la escena…",
  "Ajustando la luz…",
  "Revelando…",
] as const;

/** Cada cuánto avanza el relleno. */
export const FILLER_ROTATION_MS = 4000;

const PHASE_PHRASES: Record<Exclude<Phase, "thinking">, string> = {
  queued: "En cola…",
  code: "Ejecutando código…",
};

function attachmentPhrase(attachments: ThinkingAttachments): string | null {
  // Las imágenes pesan más que los documentos: son las que hacen lento el turno
  // (y las que provocaban el timeout que originó todo esto), así que si el
  // mensaje lleva las dos cosas, se nombra la que explica la espera.
  if (attachments.images > 0) {
    return attachments.images === 1 ? "Mirando tu imagen…" : "Mirando tus imágenes…";
  }
  if (attachments.documents > 0) {
    return attachments.documents === 1 ? "Leyendo tu documento…" : "Leyendo tus documentos…";
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
  elapsedMs: number
): string {
  const fromPhase = phase !== "thinking" ? PHASE_PHRASES[phase] : undefined;
  if (fromPhase) return fromPhase;

  const fromAttachments = attachmentPhrase(attachments);
  if (fromAttachments) return fromAttachments;

  // Se queda en la última en vez de volver al principio: reciclar la lista
  // sugiere un progreso que no existe, y a los dos minutos "Afinando el lente…"
  // por tercera vez delata que es puro decorado.
  const step = Math.floor(Math.max(0, elapsedMs) / FILLER_ROTATION_MS);
  const index = Math.min(step, FILLER_PHRASES.length - 1);
  return FILLER_PHRASES[index];
}
