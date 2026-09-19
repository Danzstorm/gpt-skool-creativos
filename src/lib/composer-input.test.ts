import { describe, expect, it } from "vitest";
import { composerFieldDisabled } from "./composer-input";

describe("composerFieldDisabled", () => {
  it("permite escribir mientras un video se analiza", () => {
    expect(composerFieldDisabled({ isLoading: false, isTranscribing: false })).toBe(false);
  });

  it("sí bloquea durante la respuesta del chat o el dictado del mic", () => {
    expect(composerFieldDisabled({ isLoading: true, isTranscribing: false })).toBe(true);
    expect(composerFieldDisabled({ isLoading: false, isTranscribing: true })).toBe(true);
  });
});
