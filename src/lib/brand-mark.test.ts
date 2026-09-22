import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const layout = readFileSync(join(here, "..", "app", "layout.tsx"), "utf8");
const favicon = readFileSync(join(root, "public", "favicon.svg"), "utf8");
const catalog = readFileSync(join(here, "..", "components", "GptCatalog.tsx"), "utf8");

describe("marca: blob estático + canvas animado", () => {
  it("layout usa /favicon.svg en icon, shortcut y apple; no hay icon.tsx generado", () => {
    expect(layout).toMatch(/icon:\s*\[\s*\{\s*url:\s*"\/favicon\.svg"/);
    expect(layout).toMatch(/shortcut:\s*"\/favicon\.svg"/);
    expect(layout).toMatch(/apple:\s*"\/favicon\.svg"/);
    expect(existsSync(join(here, "..", "app", "icon.tsx"))).toBe(false);
    expect(existsSync(join(here, "..", "app", "apple-icon.tsx"))).toBe(false);
  });

  it("el favicon es el blob de Martin, no un spark ni un canvas", () => {
    expect(favicon).toMatch(/#ffb342/);
    expect(favicon).toMatch(/#ff526b/);
    expect(favicon).toMatch(/#ff2caf/);
    expect(favicon).toMatch(/#cf41ef/);
    expect(favicon).toMatch(/#7e67ff/);
    expect(favicon).not.toMatch(/FEC200/);
    expect(favicon).not.toMatch(/canvas/i);
  });

  it("el catálogo no monta otro EnergyCanvas; home/GPT ya lo cubre energy-canvas.test", () => {
    expect(catalog).not.toMatch(/EnergyCanvas/);
  });
});
