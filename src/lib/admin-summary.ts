export const VISIBLE_RANGES = ["7d", "30d", "90d"] as const;
export const HIDDEN_RANGES = ["1d", "all"] as const;
export const RANGE_DAYS = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export type RangeKey = keyof typeof RANGE_DAYS;
export type VisibleRange = (typeof VISIBLE_RANGES)[number];

export type AdminPeriod =
  | { kind: "range"; key: RangeKey }
  | { kind: "month"; month: string };

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const SHORT_MONTHS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];

export function parseAdminPeriod(input: { range?: string; month?: string }): AdminPeriod {
  const month = input.month?.trim() ?? "";
  if (MONTH_RE.test(month)) return { kind: "month", month };
  const range = input.range;
  if (range && range in RANGE_DAYS) return { kind: "range", key: range as RangeKey };
  return { kind: "range", key: "30d" };
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayKeyFromIso(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDayKey(parsed);
}

export function periodBounds(period: AdminPeriod, now = new Date()): { since: Date; until: Date } {
  const today = startOfLocalDay(now);
  const until = addLocalDays(today, 1);
  if (period.kind === "month") {
    const match = MONTH_RE.exec(period.month);
    if (!match) return { since: addLocalDays(today, -29), until };
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const since = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);
    return { since, until: monthEnd.getTime() < until.getTime() ? monthEnd : until };
  }
  const days = RANGE_DAYS[period.key];
  if (days == null) return { since: new Date(0), until };
  return { since: addLocalDays(today, -(days - 1)), until };
}

export function enumerateDays(since: Date, until: Date): string[] {
  const days: string[] = [];
  for (let cursor = startOfLocalDay(since); cursor < until; cursor = addLocalDays(cursor, 1)) {
    days.push(toDayKey(cursor));
  }
  return days;
}

export function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return `${String(day).padStart(2, "0")} ${SHORT_MONTHS[month - 1]}`;
}

export function formatRangeCaption(since: Date, until: Date): string {
  const last = addLocalDays(until, -1);
  return `${formatDayLabel(toDayKey(since))} – ${formatDayLabel(toDayKey(last))}`;
}

export function formatMonthLabel(month: string, now = new Date()): string {
  const match = MONTH_RE.exec(month);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : now;
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export function currentMonthValue(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function money(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("es-PE");
}

/** Claves que un RSC puede pasar a AdminChartPanel. Una función no serializa. */
export type ChartFormat = "count" | "money" | "percent";

export function formatChartValue(format: ChartFormat, n: number): string {
  if (format === "money") return money(n);
  if (format === "percent") return `${n.toFixed(1)}%`;
  return formatCount(n);
}

export function activityPct(active: number, members: number): number {
  if (!members) return 0;
  return (active / members) * 100;
}

export type UsageRow = { created_at: string; user_id: string | null; cost: number | null };
export type ThreadRow = { created_at: string };

export type DailyPoint = {
  date: string;
  activeUsers: number;
  messages: number;
  newThreads: number;
  cost: number;
};

export function buildDailySeries(
  days: string[],
  usage: UsageRow[],
  threads: ThreadRow[]
): DailyPoint[] {
  const usersByDay = new Map<string, Set<string>>();
  const messagesByDay = new Map<string, number>();
  const costByDay = new Map<string, number>();
  const threadsByDay = new Map<string, number>();

  for (const row of usage) {
    const day = dayKeyFromIso(row.created_at);
    if (!day) continue;
    messagesByDay.set(day, (messagesByDay.get(day) ?? 0) + 1);
    costByDay.set(day, (costByDay.get(day) ?? 0) + Number(row.cost ?? 0));
    if (row.user_id) {
      const set = usersByDay.get(day) ?? new Set<string>();
      set.add(row.user_id);
      usersByDay.set(day, set);
    }
  }

  for (const row of threads) {
    const day = dayKeyFromIso(row.created_at);
    if (!day) continue;
    threadsByDay.set(day, (threadsByDay.get(day) ?? 0) + 1);
  }

  return days.map((date) => ({
    date,
    activeUsers: usersByDay.get(date)?.size ?? 0,
    messages: messagesByDay.get(date) ?? 0,
    newThreads: threadsByDay.get(date) ?? 0,
    cost: costByDay.get(date) ?? 0,
  }));
}

export function seriesHasSignal(points: DailyPoint[]): boolean {
  return points.some((point) => point.activeUsers || point.messages || point.newThreads || point.cost);
}

const PAGE_SIZE = 500;

export async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
