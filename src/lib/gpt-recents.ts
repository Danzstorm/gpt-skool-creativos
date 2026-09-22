// Recientes del sidebar. La clave y el JSON tienen que sobrevivir deploys:
// igual que el colapso del sidebar, un rename o un formato distinto vaciaría
// la lista el día del ship. El catálogo de home no usa este tope.

export const RECENT_GPTS_KEY = "chat_recent_gpts";
export const SIDEBAR_RECENT_GPT_LIMIT = 5;

/** Techo del historial persistido: el sidebar solo enseña 5, el resto queda para reordenar. */
const RECENT_GPTS_STORE_LIMIT = 40;

export type RecentThreadHint = {
  gpt_id: string;
  updated_at: string;
  created_at?: string;
};

/**
 * Lee ids recientes. JSON corrupto, un valor que no es array o ids que no son
 * string se tratan como vacío: es preferible perder el orden a tumbar el chat.
 */
export function parseRecentGptIds(raw: string | null): string[] {
  if (raw == null) return [];
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function recentGptsStorageValue(ids: string[]): string {
  return JSON.stringify(ids);
}

/** Sube `gptId` al frente. No muta el original. */
export function touchRecentGptId(ids: string[], gptId: string): string[] {
  if (!gptId) return ids;
  return [gptId, ...ids.filter((id) => id !== gptId)].slice(0, RECENT_GPTS_STORE_LIMIT);
}

function threadRecencyMs(thread: RecentThreadHint): number {
  const updated = Date.parse(thread.updated_at);
  if (!Number.isNaN(updated)) return updated;
  const created = thread.created_at ? Date.parse(thread.created_at) : NaN;
  return Number.isNaN(created) ? 0 : created;
}

/** gpt_id únicos, el del chat más reciente primero. */
export function gptIdsFromRecentThreads(threads: RecentThreadHint[]): string[] {
  const ranked = [...threads].sort((a, b) => threadRecencyMs(b) - threadRecencyMs(a));
  const seen = new Set<string>();
  const order: string[] = [];
  for (const thread of ranked) {
    if (!thread.gpt_id || seen.has(thread.gpt_id)) continue;
    seen.add(thread.gpt_id);
    order.push(thread.gpt_id);
  }
  return order;
}

/**
 * Hasta `limit` GPTs para el sidebar: persistidos (último uso), luego último
 * chat con ese GPT. Ids desconocidos se descartan. El activo se clava si no
 * entra solo — un `?gpt=` no puede dejar el sidebar sin el GPT de la URL.
 */
export function pickRecentGpts<T extends { id: string }>(
  gpts: T[],
  persistedIds: string[],
  threads: RecentThreadHint[],
  activeGptId: string | null = null,
  limit = SIDEBAR_RECENT_GPT_LIMIT
): T[] {
  const byId = new Map(gpts.map((gpt) => [gpt.id, gpt]));
  const seen = new Set<string>();
  const order: string[] = [];

  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    order.push(id);
  };

  for (const id of persistedIds) push(id);
  for (const id of gptIdsFromRecentThreads(threads)) push(id);

  let sliced = order.slice(0, limit);
  if (activeGptId && byId.has(activeGptId) && !sliced.includes(activeGptId)) {
    sliced = [activeGptId, ...sliced].slice(0, limit);
  }

  return sliced.map((id) => byId.get(id)!);
}

export function gptMatchesSearch(
  gpt: { name: string; description?: string | null; author?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${gpt.name} ${gpt.description ?? ""} ${gpt.author ?? ""}`.toLowerCase().includes(q);
}
