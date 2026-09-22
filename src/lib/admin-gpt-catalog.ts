import { formatCount, money } from "./admin-summary";

/** Copiar prompt solo vive en el clipboard del cliente: no hay evento persistido. */
export const COPIES_EMPTY = "Sin datos";
/** No hay log de errores por GPT conectado al catálogo. */
export const ERRORS_EMPTY = "Sin conectar";
/** RPC de uso falló: no inventar 0 ni los senos del prototipo. */
export const USAGE_EMPTY = "—";

export type GptUsageSummary = {
  gpt_id: string | null;
  unique_users?: number | null;
  message_count?: number | null;
  total_cost?: number | null;
};

export type GptUsage30d = {
  unique_users: number;
  message_count: number;
  total_cost: number;
};

export type CatalogMetric =
  | { kind: "count"; value: number; display: string }
  | { kind: "money"; value: number; display: string }
  | { kind: "percent"; value: number; display: string }
  | { kind: "empty"; display: string };

export type GptCatalogMetrics = {
  uniqueUsers: CatalogMetric;
  messages: CatalogMetric;
  copies: CatalogMetric;
  aiCost: CatalogMetric;
  errors: CatalogMetric;
};

function n(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function usageByGptId(rows: GptUsageSummary[] | null | undefined): Map<string, GptUsageSummary> {
  const map = new Map<string, GptUsageSummary>();
  for (const row of rows ?? []) {
    if (row.gpt_id) map.set(String(row.gpt_id), row);
  }
  return map;
}

export function attachUsage30d<T extends { id: string }>(
  gpts: T[],
  rows: GptUsageSummary[] | null | undefined,
  usageAvailable: boolean
): Array<T & { usage_30d: GptUsage30d | null }> {
  const byId = usageByGptId(rows);
  return gpts.map((gpt) => {
    if (!usageAvailable) return { ...gpt, usage_30d: null };
    const row = byId.get(String(gpt.id));
    return {
      ...gpt,
      usage_30d: {
        unique_users: n(row?.unique_users),
        message_count: n(row?.message_count),
        total_cost: n(row?.total_cost),
      },
    };
  });
}

export function mapGptCatalogMetrics(input: {
  usage: GptUsage30d | GptUsageSummary | null | undefined;
  usageAvailable: boolean;
  copyCount?: number | null;
  copiesAvailable?: boolean;
  errorCount?: number | null;
  errorsAvailable?: boolean;
}): GptCatalogMetrics {
  const usage = input.usageAvailable
    ? {
        unique_users: n(input.usage?.unique_users),
        message_count: n(input.usage?.message_count),
        total_cost: n(input.usage?.total_cost),
      }
    : null;

  const uniqueUsers: CatalogMetric = usage
    ? { kind: "count", value: usage.unique_users, display: formatCount(usage.unique_users) }
    : { kind: "empty", display: USAGE_EMPTY };

  const messages: CatalogMetric = usage
    ? { kind: "count", value: usage.message_count, display: formatCount(usage.message_count) }
    : { kind: "empty", display: USAGE_EMPTY };

  const aiCost: CatalogMetric = usage
    ? { kind: "money", value: usage.total_cost, display: money(usage.total_cost) }
    : { kind: "empty", display: USAGE_EMPTY };

  let copies: CatalogMetric = { kind: "empty", display: COPIES_EMPTY };
  if (input.copiesAvailable && input.copyCount != null) {
    const copyCount = n(input.copyCount);
    if (usage && usage.message_count > 0) {
      const pct = Math.round((copyCount / usage.message_count) * 100);
      copies = { kind: "percent", value: pct, display: `${pct}%` };
    } else if (usage) {
      copies = { kind: "percent", value: 0, display: "0%" };
    }
  }

  let errors: CatalogMetric = { kind: "empty", display: ERRORS_EMPTY };
  if (input.errorsAvailable && input.errorCount != null) {
    const errorCount = n(input.errorCount);
    errors = { kind: "count", value: errorCount, display: formatCount(errorCount) };
  }

  return { uniqueUsers, messages, copies, aiCost, errors };
}

export function gptCatalogMetricRows(metrics: GptCatalogMetrics): { label: string; display: string }[] {
  return [
    { label: "Usuarios únicos", display: metrics.uniqueUsers.display },
    { label: "Mensajes", display: metrics.messages.display },
    { label: "Copiadas", display: metrics.copies.display },
    { label: "Costo IA", display: metrics.aiCost.display },
    { label: "Errores", display: metrics.errors.display },
  ];
}
