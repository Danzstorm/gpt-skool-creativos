import { describe, expect, it } from "vitest";
import { cleanGeneratedTitle } from "./thread-title";

describe("cleanGeneratedTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanGeneratedTitle("  Título del chat  ")).toBe("Título del chat");
  });

  it("strips a trailing period", () => {
    expect(cleanGeneratedTitle("Estrategia de precios.")).toBe("Estrategia de precios");
  });

  it("strips wrapping quotes the model adds despite instructions", () => {
    expect(cleanGeneratedTitle('"Plan de viaje a Río"')).toBe("Plan de viaje a Río");
    expect(cleanGeneratedTitle("“Plan de viaje a Río”")).toBe("Plan de viaje a Río");
  });

  it("clamps to 40 chars cutting at a word boundary", () => {
    const long = "Estrategia de contenido para redes sociales de marca personal";
    expect(cleanGeneratedTitle(long)).toBe("Estrategia de contenido para redes");
  });

  it("hard-clamps to 40 chars when there is no space to cut at", () => {
    expect(cleanGeneratedTitle("a".repeat(100))).toHaveLength(40);
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(cleanGeneratedTitle("")).toBe("");
    expect(cleanGeneratedTitle("   ")).toBe("");
  });
});
