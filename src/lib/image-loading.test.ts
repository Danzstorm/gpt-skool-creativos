import { describe, expect, it } from "vitest";
import { IMAGE_REVEAL_MIN_MS, imageRevealWaitMs } from "./image-loading";

describe("imageRevealWaitMs", () => {
  it("espera el mínimo si acaba de arrancar", () => {
    expect(imageRevealWaitMs(1000, 1000)).toBe(IMAGE_REVEAL_MIN_MS);
  });

  it("no pide más de 0 cuando ya pasó el mínimo", () => {
    expect(imageRevealWaitMs(1000, 1000 + IMAGE_REVEAL_MIN_MS + 50)).toBe(0);
  });

  it("resta el tiempo ya transcurrido", () => {
    expect(imageRevealWaitMs(1000, 1500)).toBe(IMAGE_REVEAL_MIN_MS - 500);
  });
});
