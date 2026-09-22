// Catálogo del chat: mismos activos que ve admin (is_active), sin tope de 9
// del prototipo. El sidebar de recientes tiene su propio límite.

export function activeGptsForChat<T extends { is_active: boolean; sort_order: number }>(
  gpts: T[]
): T[] {
  return gpts
    .filter((gpt) => gpt.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}
