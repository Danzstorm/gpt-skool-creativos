// GPTs del sidebar, como el prototipo de Martin (renderNavigation): los
// primeros 5 del catálogo en el orden del admin, y el GPT activo como sexto
// si no está entre ellos. El catálogo de home no usa este tope.

export const SIDEBAR_GPT_LIMIT = 5;

/** `gpts` ya viene ordenado por sort_order. */
export function pickSidebarGpts<T extends { id: string }>(
  gpts: T[],
  activeGptId: string | null = null,
  limit = SIDEBAR_GPT_LIMIT
): T[] {
  const fixed = gpts.slice(0, limit);
  const active = activeGptId ? gpts.find((gpt) => gpt.id === activeGptId) : undefined;
  return active && !fixed.includes(active) ? [...fixed, active] : fixed;
}

export function gptMatchesSearch(
  gpt: { name: string; description?: string | null; author?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${gpt.name} ${gpt.description ?? ""} ${gpt.author ?? ""}`.toLowerCase().includes(q);
}
