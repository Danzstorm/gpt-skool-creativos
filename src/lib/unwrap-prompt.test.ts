import { describe, expect, it } from "vitest";
import { unwrapPromptFence } from "./unwrap-prompt";

describe("unwrapPromptFence", () => {
  it("saca el interior cuando el mensaje entero es un fence", () => {
    expect(unwrapPromptFence("```\nReferencia de locación: @image_1\nEstilo: cine\n```")).toBe(
      "Referencia de locación: @image_1\nEstilo: cine"
    );
  });

  it("respeta un lenguaje en el fence", () => {
    expect(unwrapPromptFence("```markdown\nHola\n```")).toBe("Hola");
  });

  it("no toca markdown mixto ni texto suelto", () => {
    expect(unwrapPromptFence("Mirá esto:\n```\ncódigo\n```")).toBe("Mirá esto:\n```\ncódigo\n```");
    expect(unwrapPromptFence("Referencia de locación: @image_1")).toBe(
      "Referencia de locación: @image_1"
    );
  });
});
