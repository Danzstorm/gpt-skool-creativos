import { describe, expect, it } from "vitest";
import { gptMatchesSearch, pickSidebarGpts, SIDEBAR_GPT_LIMIT } from "./gpt-recents";

const gpt = (id: string) => ({ id, name: id });
const catalog = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"].map(gpt);

describe("pickSidebarGpts", () => {
  it("muestra los primeros 5 del catálogo en orden", () => {
    expect(SIDEBAR_GPT_LIMIT).toBe(5);
    expect(pickSidebarGpts(catalog).map((g) => g.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("agrega el activo como sexto si no está entre los 5", () => {
    expect(pickSidebarGpts(catalog, "h").map((g) => g.id)).toEqual(["a", "b", "c", "d", "e", "h"]);
  });

  it("no duplica el activo si ya está entre los 5", () => {
    expect(pickSidebarGpts(catalog, "b").map((g) => g.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignora un activo desconocido y catálogos cortos", () => {
    expect(pickSidebarGpts(catalog, "zzz")).toHaveLength(5);
    expect(pickSidebarGpts(catalog.slice(0, 2), "b").map((g) => g.id)).toEqual(["a", "b"]);
    expect(pickSidebarGpts([], "a")).toEqual([]);
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
