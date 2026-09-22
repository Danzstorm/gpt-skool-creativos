import { describe, expect, it } from "vitest";
import { clampTextSize, parseTextSize, scaledPx, textSizeCss } from "./text-size";

describe("scaledPx", () => {
  it("suma 0.75px a bases menores de 20 y luego aplica el factor", () => {
    expect(scaledPx(13, 100)).toBe(13.75);
    expect(scaledPx(11, 100)).toBe(11.75);
    expect(scaledPx(14, 100)).toBe(14.75);
  });

  it("multiplica directo los títulos grandes", () => {
    expect(scaledPx(46, 100)).toBe(46);
    expect(scaledPx(37, 100)).toBe(37);
    expect(scaledPx(46, 125)).toBe(57.5);
  });

  it("respeta 85% y 125%", () => {
    expect(scaledPx(13, 85)).toBeCloseTo(11.6875);
    expect(scaledPx(13, 125)).toBeCloseTo(17.1875);
  });
});

describe("clampTextSize / parseTextSize", () => {
  it("acota al rango 85–125", () => {
    expect(clampTextSize(80)).toBe(85);
    expect(clampTextSize(200)).toBe(125);
  });

  it("ignora valores no numéricos", () => {
    expect(parseTextSize(null)).toBeNull();
    expect(parseTextSize("abc")).toBeNull();
    expect(parseTextSize("100")).toBe(100);
  });
});

describe("textSizeCss", () => {
  it("emite --text-scale y reglas con !important, sin zoom", () => {
    const css = textSizeCss(100);
    expect(css).toContain("--text-scale:1");
    expect(css).toContain("13.75px!important");
    expect(css).toContain("word-spacing:.06em!important");
    expect(css).toContain("word-spacing:normal!important");
    expect(css).toContain("#chatIntro .gpt-intro-copy");
    expect(css).not.toContain("zoom");
  });
});
