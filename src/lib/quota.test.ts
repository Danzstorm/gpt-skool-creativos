import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkMessageQuotaWithDeps,
  startOfMonthIso,
  type QuotaDeps,
} from "./quota";

type QueryContext = {
  table: string;
  filters: Record<string, unknown>;
  mode: "single" | "head";
};

type TableResponder = (ctx: QueryContext) => {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
};

function fakeQuotaService(responders: Record<string, TableResponder>) {
  const calls: QueryContext[] = [];

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let head = false;

      const builder = {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          head = opts?.head === true;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        gte(col: string, val: unknown) {
          filters[`gte:${col}`] = val;
          return builder;
        },
        single() {
          return run("single");
        },
        then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
          return run(head ? "head" : "single").then(resolve, reject);
        },
      };

      async function run(mode: QueryContext["mode"]) {
        const ctx: QueryContext = { table, filters, mode };
        calls.push(ctx);
        const responder = responders[table];
        if (!responder) return { data: null, error: { message: `sin mock: ${table}` } };
        return responder(ctx);
      }

      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

function deps(
  service: SupabaseClient,
  now: Date
): QuotaDeps {
  return { service, now: () => now };
}

describe("startOfMonthIso", () => {
  it("usa el primer instante del mes en UTC", () => {
    expect(startOfMonthIso(new Date("2026-03-15T14:22:00.000Z"))).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });

  it("cambia de mes en el borde UTC, no en hora local", () => {
    const lastSecondOfFeb = new Date("2026-02-28T23:59:59.999Z");
    const firstSecondOfMar = new Date("2026-03-01T00:00:00.000Z");

    expect(startOfMonthIso(lastSecondOfFeb)).toBe("2026-02-01T00:00:00.000Z");
    expect(startOfMonthIso(firstSecondOfMar)).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("checkMessageQuotaWithDeps", () => {
  it("permite uso ilimitado cuando el miembro no tiene límite propio ni global", async () => {
    const { client } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: null } }),
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
    });

    await expect(
      checkMessageQuotaWithDeps("user-1", "ana@empresa.com", deps(client, new Date()))
    ).resolves.toEqual({ ok: true, limit: null, used: 0 });
  });

  it("usa el límite individual por encima del global", async () => {
    const { client, calls } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: 5 } }),
      app_settings: () => ({ data: { default_monthly_message_limit: 100 } }),
      messages: () => ({ count: 3 }),
    });

    const result = await checkMessageQuotaWithDeps(
      "user-1",
      "ana@empresa.com",
      deps(client, new Date("2026-04-10T12:00:00.000Z"))
    );

    expect(result).toEqual({ ok: true, limit: 5, used: 3 });
    expect(calls.find((c) => c.table === "messages")?.filters).toMatchObject({
      user_id: "user-1",
      role: "assistant",
      "gte:created_at": "2026-04-01T00:00:00.000Z",
    });
  });

  it("cae al límite global cuando el miembro no tiene override", async () => {
    const { client } = fakeQuotaService({
      allowed_members: () => ({
        data: null,
        error: { message: "JSON object requested, multiple (or no) rows returned" },
      }),
      app_settings: () => ({ data: { default_monthly_message_limit: 10 } }),
      messages: () => ({ count: 10 }),
    });

    await expect(
      checkMessageQuotaWithDeps("user-1", "nuevo@empresa.com", deps(client, new Date()))
    ).resolves.toEqual({ ok: false, limit: 10, used: 10 });
  });

  it("bloquea cuando el uso alcanza el límite (used < limit es la regla)", async () => {
    const { client } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: 2 } }),
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
      messages: () => ({ count: 2 }),
    });

    await expect(
      checkMessageQuotaWithDeps("user-1", "ana@empresa.com", deps(client, new Date()))
    ).resolves.toEqual({ ok: false, limit: 2, used: 2 });
  });

  it("normaliza el email antes de buscar el override del miembro", async () => {
    const { client, calls } = fakeQuotaService({
      allowed_members: (ctx) => {
        expect(ctx.filters.email).toBe("ana@empresa.com");
        return { data: { monthly_message_limit: 1 } };
      },
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
      messages: () => ({ count: 0 }),
    });

    await checkMessageQuotaWithDeps("user-1", "  Ana@Empresa.com  ", deps(client, new Date()));
    expect(calls.some((c) => c.table === "allowed_members")).toBe(true);
  });

  it("rechaza email vacío o solo espacios sin consultar cuota", async () => {
    const { client, calls } = fakeQuotaService({});

    await expect(
      checkMessageQuotaWithDeps("user-1", "   ", deps(client, new Date()))
    ).resolves.toEqual({ ok: false, limit: null, used: 0 });
    expect(calls).toHaveLength(0);
  });

  it("fail-closed si falla el conteo de mensajes con límite activo", async () => {
    const { client } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: 5 } }),
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
      messages: () => ({ count: null, error: { message: "timeout" } }),
    });

    await expect(
      checkMessageQuotaWithDeps("user-1", "ana@empresa.com", deps(client, new Date()))
    ).resolves.toEqual({ ok: false, limit: 5, used: 0 });
  });

  it("trata count nulo sin error como cero usos", async () => {
    const { client } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: 3 } }),
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
      messages: () => ({ count: null }),
    });

    await expect(
      checkMessageQuotaWithDeps("user-1", "ana@empresa.com", deps(client, new Date()))
    ).resolves.toEqual({ ok: true, limit: 3, used: 0 });
  });

  it("no consulta mensajes cuando no hay límite efectivo", async () => {
    const { client, calls } = fakeQuotaService({
      allowed_members: () => ({ data: { monthly_message_limit: null } }),
      app_settings: () => ({ data: { default_monthly_message_limit: null } }),
    });

    await checkMessageQuotaWithDeps("user-1", "ana@empresa.com", deps(client, new Date()));
    expect(calls.some((c) => c.table === "messages")).toBe(false);
  });
});
