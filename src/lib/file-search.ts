// Lógica del menú `@` del composer, fuera de React para poder testearla.
//
// Son tres cosas que parecen triviales y no lo son: decidir si el cursor está
// dentro de una mención (sin abrirse dentro de un correo), filtrar de forma que
// "referencia" encuentre "Referencia", y mover el índice activo con las flechas
// dando la vuelta en los extremos.

export interface MentionQuery {
  /** Índice del `@` en el texto. */
  start: number;
  /** Lo escrito entre el `@` y el cursor. */
  query: string;
}

/** Primer y último code point de las marcas diacríticas combinantes. */
const COMBINING_FIRST = 0x300;
const COMBINING_LAST = 0x36f;

/**
 * Minúsculas y sin acentos, para que la búsqueda no dependa de cómo se teclee.
 *
 * `normalize("NFD")` separa cada letra acentuada en letra + marca combinante, y
 * después se descartan esas marcas por code point. Se filtra en vez de usar un
 * rango en una expresión regular a propósito: ese rango se escribe con
 * caracteres invisibles en el editor y cualquiera los rompe sin darse cuenta.
 */
export function normalize(value: string): string {
  return [...value.toLowerCase().normalize("NFD")]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < COMBINING_FIRST || code > COMBINING_LAST;
    })
    .join("");
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

/** Filtra por nombre, ignorando mayúsculas y acentos. Consulta vacía = todo. */
export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = normalize(query.trim());
  if (!needle) return items;
  return items.filter((item) => normalize(item.name).includes(needle));
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
