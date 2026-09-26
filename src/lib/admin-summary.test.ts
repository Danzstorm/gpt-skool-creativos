import { describe, expect, it } from "vitest";
import {
  activityPct,
  buildDailySeries,
  currentMonthValue,
  enumerateDays,
  formatChartValue,
  formatMonthLabel,
  formatRangeCaption,
  money,
  parseAdminPeriod,
  periodBounds,
  seriesHasSignal,
} from "./admin-summary";

describe("parseAdminPeriod", () => {
  it("acepta 7d/30d/90d y deja 1d/all para deep links", () => {
    expect(parseAdminPeriod({ range: "7d" })).toEqual({ kind: "range", key: "7d" });
    expect(parseAdminPeriod({ range: "1d" })).toEqual({ kind: "range", key: "1d" });
    expect(parseAdminPeriod({ range: "all" })).toEqual({ kind: "range", key: "all" });
  });

  it("prioriza month=YYYY-MM y cae a 30d si no hay query", () => {
    expect(parseAdminPeriod({ range: "7d", month: "2026-09" })).toEqual({
      kind: "month",
      month: "2026-09",
    });
    expect(parseAdminPeriod({})).toEqual({ kind: "range", key: "30d" });
  });
});

describe("periodBounds / captions", () => {
  const now = new Date(2026, 8, 22, 15, 0, 0);

  it("usa días calendario inclusivos, no senos inventados", () => {
    const { since, until } = periodBounds({ kind: "range", key: "7d" }, now);
    expect(enumerateDays(since, until)).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
    expect(formatRangeCaption(since, until)).toBe("16-set. – 22-set.");
  });

  it("acota el mes actual hasta hoy", () => {
    const { since, until } = periodBounds({ kind: "month", month: "2026-09" }, now);
    expect(enumerateDays(since, until)[0]).toBe("2026-09-01");
    expect(enumerateDays(since, until).at(-1)).toBe("2026-09-22");
    expect(formatMonthLabel("2026-09", now)).toBe("septiembre de 2026");
    expect(currentMonthValue(now)).toBe("2026-09");
  });
});

describe("buildDailySeries", () => {
  it("ubica las filas sumadas en SQL en su día y deja en cero los días vacíos", () => {
    const points = buildDailySeries(
      ["2026-09-21", "2026-09-22", "2026-09-23"],
      [
        { day: "2026-09-21", messages: "2", active_users: "2", cost: "0.3", new_threads: "0" },
        { day: "2026-09-22", messages: 1, active_users: 1, cost: 0.4, new_threads: 1 },
      ]
    );
    expect(points[0]).toMatchObject({ date: "2026-09-21", activeUsers: 2, messages: 2, newThreads: 0 });
    expect(points[0].cost).toBeCloseTo(0.3);
    expect(points[1]).toMatchObject({ date: "2026-09-22", activeUsers: 1, messages: 1, newThreads: 1 });
    expect(points[2]).toMatchObject({ date: "2026-09-23", activeUsers: 0, messages: 0, newThreads: 0, cost: 0 });
    expect(seriesHasSignal(points)).toBe(true);
    expect(seriesHasSignal(buildDailySeries(["2026-09-22"], []))).toBe(false);
  });
});

describe("formatters", () => {
  it("formatea dinero y actividad sin inventar decimales raros", () => {
    expect(money(28.74)).toBe("$28.74");
    expect(money(0.0012)).toBe("$0.0012");
    expect(activityPct(16, 24)).toBeCloseTo(66.666, 2);
    expect(activityPct(4, 0)).toBe(0);
  });

  it("las claves del chart son JSON-serializables hacia el client", () => {
    const payload = {
      label: "Actividad",
      value: "67%",
      series: [1, 2],
      format: "percent" as const,
      chartLabel: "Actividad diaria",
    };
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(JSON.parse(JSON.stringify(payload)).format).toBe("percent");
    expect(formatChartValue("money", 28.74)).toBe("$28.74");
    expect(formatChartValue("percent", 66.66)).toBe("66.7%");
    expect(formatChartValue("count", 12)).toBe("12");
  });
});
