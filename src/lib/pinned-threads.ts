export const PINNED_THREADS_KEY = "creativos-pinned-threads";

export function parsePinnedThreadIds(raw: string | null): string[] {
  if (raw == null) return [];
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function togglePinnedThreadId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((openId) => openId !== id) : [id, ...ids];
}

export function sortPinnedFirst<T extends { id: string }>(items: T[], pinnedIds: string[]): T[] {
  if (pinnedIds.length === 0) return items;
  const rank = new Map(pinnedIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = rank.has(a.id);
    const pb = rank.has(b.id);
    if (pa && pb) return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });
}
