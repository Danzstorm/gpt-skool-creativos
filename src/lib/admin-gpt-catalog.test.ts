import { describe, expect, it } from "vitest";
import {
  COPIES_EMPTY,
  ERRORS_EMPTY,
  USAGE_EMPTY,
  attachUsage30d,
  gptCatalogMetricRows,
  mapGptCatalogMetrics,
} from "./admin-gpt-catalog";
import { money } from "./admin-summary";

describe("attachUsage30d", () => {
  it("pega el uso real por gpt_id y deja ceros honestos si no hay eventos", () => {
    const attached = attachUsage30d(
      [{ id: "a" }, { id: "b" }],
      [{ gpt_id: "a", unique_users: 12, message_count: 40, total_cost: 1.25 }],
      true
    );
    expect(attached[0].usage_30d).toEqual({
      unique_users: 12,
      message_count: 40,
      total_cost: 1.25,
    });
    expect(attached[1].usage_30d).toEqual({
      unique_users: 0,
      message_count: 0,
      total_cost: 0,
    });
  });

  it("si el RPC falló, usage_30d es null — no rellena senos del prototipo", () => {
    const attached = attachUsage30d([{ id: "a" }], [{ gpt_id: "a", unique_users: 62, message_count: 642 }], false);
    expect(attached[0].usage_30d).toBeNull();
  });
});

describe("mapGptCatalogMetrics", () => {
  it("formatea usuarios, mensajes y costo como el Resumen", () => {
    const metrics = mapGptCatalogMetrics({
      usage: { unique_users: 16, message_count: 278, total_cost: 1.67 },
      usageAvailable: true,
    });
    expect(metrics.uniqueUsers).toMatchObject({ kind: "count", value: 16, display: "16" });
    expect(metrics.messages).toMatchObject({ kind: "count", value: 278, display: "278" });
    expect(metrics.aiCost).toMatchObject({ kind: "money", value: 1.67, display: money(1.67) });
    expect(metrics.aiCost.display).toBe("$1.67");
  });

  it("cero de uso es 0 / $0.00, no un porcentaje inventado", () => {
    const metrics = mapGptCatalogMetrics({
      usage: { unique_users: 0, message_count: 0, total_cost: 0 },
      usageAvailable: true,
    });
    expect(metrics.uniqueUsers.display).toBe("0");
    expect(metrics.messages.display).toBe("0");
    expect(metrics.aiCost.display).toBe("$0.00");
    expect(metrics.copies.display).toBe(COPIES_EMPTY);
    expect(metrics.errors.display).toBe(ERRORS_EMPTY);
  });

  it("sin RPC: — en uso, Sin datos en copias, Sin conectar en errores", () => {
    const metrics = mapGptCatalogMetrics({ usage: null, usageAvailable: false });
    expect(metrics.uniqueUsers.display).toBe(USAGE_EMPTY);
    expect(metrics.messages.display).toBe(USAGE_EMPTY);
    expect(metrics.aiCost.display).toBe(USAGE_EMPTY);
    expect(metrics.copies.display).toBe(COPIES_EMPTY);
    expect(metrics.errors.display).toBe(ERRORS_EMPTY);
    const labels = gptCatalogMetricRows(metrics).map((row) => row.label);
    expect(labels).toEqual(["Usuarios únicos", "Mensajes", "Copiadas", "Costo IA", "Errores"]);
  });

  it("solo calcula % de copias si hay tracking persistido", () => {
    const withCopies = mapGptCatalogMetrics({
      usage: { unique_users: 10, message_count: 100, total_cost: 2 },
      usageAvailable: true,
      copiesAvailable: true,
      copyCount: 41,
    });
    expect(withCopies.copies).toMatchObject({ kind: "percent", value: 41, display: "41%" });

    const without = mapGptCatalogMetrics({
      usage: { unique_users: 10, message_count: 100, total_cost: 2 },
      usageAvailable: true,
    });
    expect(without.copies.display).toBe(COPIES_EMPTY);
    expect(without.copies.display).not.toBe("48%");
  });

  it("cuenta errores solo si hay log conectado", () => {
    const connected = mapGptCatalogMetrics({
      usageAvailable: true,
      usage: { unique_users: 1, message_count: 2, total_cost: 0.01 },
      errorsAvailable: true,
      errorCount: 3,
    });
    expect(connected.errors.display).toBe("3");

    const disconnected = mapGptCatalogMetrics({
      usageAvailable: true,
      usage: { unique_users: 1, message_count: 2, total_cost: 0.01 },
    });
    expect(disconnected.errors.display).toBe(ERRORS_EMPTY);
  });
});
