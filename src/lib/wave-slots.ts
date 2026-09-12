// Cuántas barras entran en la onda de grabación, según el ancho real disponible.
//
// Antes la cantidad era fija (40) y cada barra tenía `flex-1 max-w-[4px]`: las
// barras crecían hasta toparse en 4px y la tira quedaba en ~277px dentro de un
// composer de ~620px, pegada a la izquierda. Como el historial se ancla a la
// derecha DE LA TIRA, la muestra más nueva caía a mitad del composer y la onda
// parecía salir del medio. El ancho fijo tampoco servía: los huecos de 3px entre
// 40 barras se comen casi todo el composer de un teléfono.
//
// Derivar la cantidad del ancho mantiene el grosor tuneado (4px con 3px de
// separación) en cualquier pantalla y hace que la tira ocupe SIEMPRE el 100%.

export const BAR_PX = 4;
export const GAP_PX = 3;

/** Paso de cada ranura: la barra más su separación. */
const PITCH = BAR_PX + GAP_PX;

// Menos de 12 barras deja de leerse como onda; más de 96 vuelve a la trama densa
// que esta pantalla ya había descartado.
const MIN_SLOTS = 12;
const MAX_SLOTS = 96;

/**
 * Ranuras que caben en `width` px.
 *
 * Con n barras hay n-1 separaciones, así que el ancho ocupado es
 * `n*BAR + (n-1)*GAP`. Despejando n contra el ancho disponible sale
 * `(width + GAP) / PITCH`. Se redondea y se acota.
 *
 * Un ancho no finito o no positivo (medida antes del layout, o el contenedor
 * oculto) devuelve el mínimo en vez de NaN: es preferible una onda corta a una
 * lista de barras rota.
 */
export function slotsForWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MIN_SLOTS;
  const fit = Math.round((width + GAP_PX) / PITCH);
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, fit));
}
