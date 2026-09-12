import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkMembershipWithDeps,
  isAllowedMember,
  normalizeEmail,
  type MembershipDeps,
} from "./membership";

type QueryContext = {
  table: string;
  filters: Record<string, unknown>;
  mode: "maybeSingle" | "select";
};

type TableResponder = (ctx: QueryContext) => {
  data?: unknown;
  error?: { message: string } | null;
};

function fakeMembershipService(responders: Record<string, TableResponder>) {
  const calls: QueryContext[] = [];

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        or() {
          return builder;
        },
        maybeSingle() {
          return run("maybeSingle");
        },
        then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
          return run("select").then(resolve, reject);
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

function membershipDeps(service: SupabaseClient): MembershipDeps {
  return { service };
}

describe("normalizeEmail", () => {
  it("pasa a minúsculas y recorta espacios", () => {
    expect(normalizeEmail("  Juan@Empresa.COM  ")).toBe("juan@empresa.com");
  });
});

describe("checkMembershipWithDeps", () => {
  it("acepta miembro activo con coincidencia exacta", async () => {
    const { client } = fakeMembershipService({
      allowed_members: (ctx) => {
        if (ctx.mode === "maybeSingle" && ctx.filters.email === "ana@empresa.com") {
          return { data: { email: "ana@empresa.com", is_active: true } };
        }
        return { data: null };
      },
    });

    await expect(
      checkMembershipWithDeps("ana@empresa.com", membershipDeps(client))
    ).resolves.toEqual({ ok: true });
  });

  it("rechaza miembro inactivo como revocado", async () => {
    const { client } = fakeMembershipService({
      allowed_members: () => ({
        data: { email: "ana@empresa.com", is_active: false },
      }),
    });

    await expect(
      checkMembershipWithDeps("ana@empresa.com", membershipDeps(client))
    ).resolves.toEqual({ ok: false, kind: "revoked" });
  });

  it("devuelve not_member cuando no hay fila ni alias probable", async () => {
    const { client } = fakeMembershipService({
      allowed_members: () => ({ data: null }),
    });

    await expect(
      checkMembershipWithDeps("desconocido@empresa.com", membershipDeps(client))
    ).resolves.toEqual({ ok: false, kind: "not_member" });
  });

  it("trata email nulo, undefined o vacío como not_member", async () => {
    const { client, calls } = fakeMembershipService({});

    await expect(checkMembershipWithDeps(null, membershipDeps(client))).resolves.toEqual({
      ok: false,
      kind: "not_member",
    });
    await expect(checkMembershipWithDeps(undefined, membershipDeps(client))).resolves.toEqual({
      ok: false,
      kind: "not_member",
    });
    await expect(checkMembershipWithDeps("   ", membershipDeps(client))).resolves.toEqual({
      ok: false,
      kind: "not_member",
    });
    expect(calls).toHaveLength(0);
  });

  it("normaliza antes de consultar", async () => {
    const { client, calls } = fakeMembershipService({
      allowed_members: () => ({ data: { email: "ana@empresa.com", is_active: true } }),
    });

    await checkMembershipWithDeps("  Ana@Empresa.com  ", membershipDeps(client));
    expect(calls[0]?.filters.email).toBe("ana@empresa.com");
  });

  it("sugiere email_mismatch con alias +tag en cualquier dominio", async () => {
    let lookup = 0;
    const { client } = fakeMembershipService({
      allowed_members: (ctx) => {
        lookup += 1;
        if (lookup === 1) return { data: null };
        if (ctx.filters.email === "juan@empresa.com") {
          return { data: { email: "juan@empresa.com", is_active: true } };
        }
        return { data: null };
      },
    });

    await expect(
      checkMembershipWithDeps("juan+skool@empresa.com", membershipDeps(client))
    ).resolves.toEqual({
      ok: false,
      kind: "email_mismatch",
      memberEmail: "juan@empresa.com",
    });
  });

  it("sugiere email_mismatch por puntos irrelevantes en Gmail", async () => {
    let lookup = 0;
    const { client } = fakeMembershipService({
      allowed_members: (ctx) => {
        lookup += 1;
        if (lookup === 1) return { data: null };
        if (ctx.mode === "select") {
          return {
            data: [{ email: "jperez@gmail.com", is_active: true }],
          };
        }
        return { data: null };
      },
    });

    await expect(
      checkMembershipWithDeps("j.perez@gmail.com", membershipDeps(client))
    ).resolves.toEqual({
      ok: false,
      kind: "email_mismatch",
      memberEmail: "jperez@gmail.com",
    });
  });

  it("no autoriza por alias: +tag inactivo sigue siendo not_member", async () => {
    let lookup = 0;
    const { client } = fakeMembershipService({
      allowed_members: (ctx) => {
        lookup += 1;
        if (lookup === 1) return { data: null };
        if (ctx.filters.email === "juan@empresa.com") {
          return { data: { email: "juan@empresa.com", is_active: false } };
        }
        return { data: null };
      },
    });

    await expect(
      checkMembershipWithDeps("juan+skool@empresa.com", membershipDeps(client))
    ).resolves.toEqual({ ok: false, kind: "not_member" });
  });

  it("devuelve check_failed ante error transitorio de PostgREST", async () => {
    const { client } = fakeMembershipService({
      allowed_members: () => ({
        data: null,
        error: { message: "upstream timeout" },
      }),
    });

    await expect(
      checkMembershipWithDeps("ana@empresa.com", membershipDeps(client))
    ).resolves.toEqual({
      ok: false,
      kind: "check_failed",
      error: "upstream timeout",
    });
  });

  it("devuelve check_failed ante excepción inesperada", async () => {
    const client = {
      from() {
        throw new Error("proyecto pausado");
      },
    } as unknown as SupabaseClient;

    await expect(
      checkMembershipWithDeps("ana@empresa.com", membershipDeps(client))
    ).resolves.toEqual({
      ok: false,
      kind: "check_failed",
      error: "proyecto pausado",
    });
  });
});

describe("isAllowedMember", () => {
  it("devuelve false para email ausente sin tocar Supabase", async () => {
    await expect(isAllowedMember(null)).resolves.toBe(false);
    await expect(isAllowedMember(undefined)).resolves.toBe(false);
    await expect(isAllowedMember("   ")).resolves.toBe(false);
  });
});
