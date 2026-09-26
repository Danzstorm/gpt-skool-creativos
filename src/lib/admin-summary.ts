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

/** Fila de la RPC admin_daily_series (sumada en SQL). */
export type DailySeriesRow = {
  day: string;
  messages: number | string;
  active_users: number | string;
  cost: number | string;
  new_threads: number | string;
};

export type DailyPoint = {
  date: string;
  activeUsers: number;
  messages: number;
  newThreads: number;
  cost: number;
};

/** Una fila por día del período; los días sin actividad quedan en cero. */
export function buildDailySeries(days: string[], rows: DailySeriesRow[]): DailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return days.map((date) => {
    const row = byDay.get(date);
    return {
      date,
      activeUsers: Number(row?.active_users ?? 0),
      messages: Number(row?.messages ?? 0),
      newThreads: Number(row?.new_threads ?? 0),
      cost: Number(row?.cost ?? 0),
    };
  });
}

export function seriesHasSignal(points: DailyPoint[]): boolean {
  return points.some((point) => point.activeUsers || point.messages || point.newThreads || point.cost);
}

