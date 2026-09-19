// Lógica del menú `@` del composer, fuera de React para poder testearla.
//
// Son tres cosas que parecen triviales y no lo son: decidir si el cursor está
// dentro de una mención (sin abrirse dentro de un correo), filtrar de forma que
// "referencia" encuentre "Referencia", y mover el índice activo con las flechas
// dando la vuelta en los extremos.

import { completeTokenRange } from "./attachment-mentions";

export interface MentionQuery {
  /** Índice del `@` en el texto. */
  start: number;
  /** Lo escrito entre el `@` y el cursor. */
  query: string;
}

/**
 * Devuelve la mención en curso si el cursor está dentro de una, o null.
 *
 * El `@` cuenta solo a principio de palabra. Sin esa regla, escribir un correo
 * abre el menú a mitad de `hola@ejemplo.com`, que es el falso positivo obvio y
 * el que más molesta porque pasa escribiendo texto normal.
 *
 * Un espacio corta la mención: `@brief final` deja de serlo en cuanto se
 * escribe el espacio, así que el menú se cierra solo al seguir escribiendo.
 */
export function mentionAt(text: string, caret: number): MentionQuery | null {
  // Un token ya insertado (`@Imagen 2`) no es una consulta: el menú se abre
  // para escribir `@` o `@im`, no para editar un chip por dentro.
  if (completeTokenRange(text, caret)) return null;

  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;

  const before = at > 0 ? text[at - 1] : "";
  const atWordStart = at === 0 || /\s/.test(before);
  if (!atWordStart) return null;

  const query = upToCaret.slice(at + 1);
  if (/\s/.test(query)) return null;

  return { start: at, query };
}

/**
 * Quita la mención del texto y devuelve dónde queda el cursor.
 *
 * Se usa al elegir un archivo: el `@consulta` desaparece y el archivo pasa a
 * verse como adjunto arriba del composer. El texto que escribió la persona
 * queda limpio, sin tokens que después haya que parsear.
 */
export function removeMention(
  text: string,
  mention: MentionQuery,
  caret: number
): { text: string; caret: number } {
  return {
    text: text.slice(0, mention.start) + text.slice(caret),
    caret: mention.start,
  };
}

/**
 * Mueve el índice activo dando la vuelta en los extremos.
 *
 * El wrap importa: sin él, mantener la flecha abajo se queda trabado en el
 * último elemento y parece que el menú se colgó.
 */
export function moveIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}
