import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENERGY_CONTOURS,
  ENERGY_DEFAULT_SPEED,
  ENERGY_GPT,
  ENERGY_HOME,
  ENERGY_LOOP_STEPS,
  energyBlobCenter,
  energyContourPoint,
} from "./EnergyCanvas";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "EnergyCanvas.tsx"), "utf8");
const home = readFileSync(join(here, "..", "UnifiedChat.tsx"), "utf8");
const hero = readFileSync(join(here, "..", "chat", "GptHero.tsx"), "utf8");

describe("EnergyCanvas: parámetros del prototipo", () => {
  it("home 82 / 0.0009 y GPT 58 / 0.0025; thinking default 0.0021", () => {
    expect(ENERGY_HOME).toEqual({ size: 82, speed: 0.0009 });
    expect(ENERGY_GPT).toEqual({ size: 58, speed: 0.0025 });
    expect(ENERGY_DEFAULT_SPEED).toBe(0.0021);
    expect(home).toMatch(/<EnergyCanvas size=\{82\} speed=\{0\.0009\}/);
    expect(hero).toMatch(/<EnergyCanvas size=\{ENERGY_GPT\.size\} speed=\{ENERGY_GPT\.speed\}/);
  });

  it("porta el campo de Martin: 160 puntos, 7 contornos, blobs desplazados", () => {
    expect(ENERGY_LOOP_STEPS).toBe(160);
    expect(ENERGY_CONTOURS).toBe(7);
    expect(src).toMatch(/translate\(w \/ 2, h \/ 2\)/);
    expect(src).toMatch(/fillRect\(-w \/ 2, -h \/ 2, w \* 2, h \* 2\)/);
    expect(src).toMatch(/addColorStop\(0\.45/);
    expect(src).toMatch(/for \(let pass = 0; pass < 2/);
    expect(src).toMatch(/prefers-reduced-motion: reduce/);

    const blob0 = energyBlobCenter(82, 82, 1.5, 0);
    expect(blob0.x).toBeCloseTo(82 * 0.3 + Math.sin(1.5) * 5);
    expect(blob0.y).toBeCloseTo(82 * 0.5 + Math.cos(1.5 * 1.3) * 8);

    const t = 1.5;
    const a = (40 / 160) * Math.PI * 2;
    const r =
      1 + 0.115 * Math.sin(3 * a + t * 1.4) + 0.07 * Math.cos(5 * a - t * 0.8);
    const p = energyContourPoint(82, 82, t, 0, 40);
    expect(p.x).toBeCloseTo(41 + Math.cos(a) * 24.6 * r);
    expect(p.y).toBeCloseTo(
      41 +
        Math.sin(a) * 82 * (0.3 + 0.022 * Math.sin(t)) * r +
        Math.sin(2 * a + t) * 82 * 0.035,
    );
  });
});
