import { describe, expect, it } from "vitest";
import { firstNameOf, humanDisplayName } from "./utils";

describe("humanDisplayName", () => {
  it("devuelve el primer nombre real y nunca un email", () => {
    expect(humanDisplayName("daniel.santos.emprende@gmail.com", "Daniel Santos")).toBe(
      "Daniel Santos"
    );
    expect(humanDisplayName("  ", "ana@creativos.lat")).toBeNull();
    expect(humanDisplayName(null, undefined, "Ana")).toBe("Ana");
  });
});

describe("firstNameOf", () => {
  it("corta al nombre de pila o queda vacío si solo hay email", () => {
    expect(firstNameOf("Daniel Santos")).toBe("Daniel");
    expect(firstNameOf("daniel.santos.emprende@gmail.com")).toBe("");
    expect(firstNameOf(null, "  ")).toBe("");
  });
});
