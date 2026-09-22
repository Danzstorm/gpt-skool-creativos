import { describe, expect, it } from "vitest";
import {
  gptIdsFromRecentThreads,
  gptMatchesSearch,
  parseRecentGptIds,
  pickRecentGpts,
  recentGptsStorageValue,
  SIDEBAR_RECENT_GPT_LIMIT,
  touchRecentGptId,
} from "./gpt-recents";

const gpt = (id: string) => ({ id, name: id });

const thread = (gpt_id: string, updated_at: string) => ({
  gpt_id,
  updated_at,
  created_at: "2026-01-01T00:00:00.000Z",
});

describe("parseRecentGptIds", () => {
  it("devuelve los ids string y descarta basura del array", () => {
    expect(parseRecentGptIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseRecentGptIds('["a",1,null,"","b"]')).toEqual(["a", "b"]);
  });

  it("ante JSON corrupto o un valor que no es array, arranca vacío", () => {
    expect(parseRecentGptIds(null)).toEqual([]);
    expect(parseRecentGptIds("")).toEqual([]);
    expect(parseRecentGptIds("{no json")).toEqual([]);
    expect(parseRecentGptIds("{}")).toEqual([]);
    expect(parseRecentGptIds("null")).toEqual([]);
  });
});

describe("recentGptsStorageValue", () => {
  it("escribe el JSON que el efecto de montaje sabe leer", () => {
    expect(recentGptsStorageValue(["g1", "g2"])).toBe('["g1","g2"]');
    expect(parseRecentGptIds(recentGptsStorageValue(["g1"]))).toEqual(["g1"]);
  });
});

describe("touchRecentGptId", () => {
  it("sube el id al frente sin mutar el original ni duplicar", () => {
    const prev = ["a", "b", "c"];
    expect(touchRecentGptId(prev, "b")).toEqual(["b", "a", "c"]);
    expect(prev).toEqual(["a", "b", "c"]);
    expect(touchRecentGptId(prev, "d")).toEqual(["d", "a", "b", "c"]);
  });

  it("ignora un id vacío", () => {
    expect(touchRecentGptId(["a"], "")).toEqual(["a"]);
  });
});

describe("gptIdsFromRecentThreads", () => {
  it("ordena por último chat y deja un id por GPT", () => {
    expect(
      gptIdsFromRecentThreads([
        thread("old", "2026-01-01T00:00:00.000Z"),
        thread("new", "2026-03-01T00:00:00.000Z"),
        thread("new", "2026-02-01T00:00:00.000Z"),
        thread("mid", "2026-02-15T00:00:00.000Z"),
      ])
    ).toEqual(["new", "mid", "old"]);
  });
});

describe("pickRecentGpts", () => {
  const catalog = [gpt("a"), gpt("b"), gpt("c"), gpt("d"), gpt("e"), gpt("f"), gpt("g"), gpt("h")];

  it("prioriza persistidos y completa con el último chat, tope 6", () => {
    const picked = pickRecentGpts(
      catalog,
      ["c", "ghost", "a"],
      [
        thread("h", "2026-06-01T00:00:00.000Z"),
        thread("b", "2026-05-01T00:00:00.000Z"),
        thread("g", "2026-04-01T00:00:00.000Z"),
        thread("f", "2026-03-01T00:00:00.000Z"),
        thread("e", "2026-02-01T00:00:00.000Z"),
      ]
    );
    expect(picked.map((item) => item.id)).toEqual(["c", "a", "h", "b", "g", "f"]);
    expect(picked).toHaveLength(SIDEBAR_RECENT_GPT_LIMIT);
  });

  it("sin persistidos ni chats no rellena con el catálogo", () => {
    expect(pickRecentGpts(catalog, [], [])).toEqual([]);
  });

  it("clava el GPT activo si no entra en los 6", () => {
    const picked = pickRecentGpts(catalog, ["a", "b", "c", "d", "e", "f"], [], "h");
    expect(picked.map((item) => item.id)).toEqual(["h", "a", "b", "c", "d", "e"]);
  });

  it("no duplica el activo si ya está en la lista", () => {
    const picked = pickRecentGpts(catalog, ["a", "b"], [], "b");
    expect(picked.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("gptMatchesSearch", () => {
  it("busca en nombre, descripción y autor, sin importar mayúsculas", () => {
    const item = { name: "UGC Scripts", description: "Guiones cortos", author: "Ana" };
    expect(gptMatchesSearch(item, "ugc")).toBe(true);
    expect(gptMatchesSearch(item, "CORTOS")).toBe(true);
    expect(gptMatchesSearch(item, "ana")).toBe(true);
    expect(gptMatchesSearch(item, "foto")).toBe(false);
    expect(gptMatchesSearch(item, "  ")).toBe(true);
  });
});

