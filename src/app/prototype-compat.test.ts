import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "prototype-compat.css"),
  "utf8"
);

describe("prototype-compat: chat y chrome", () => {
  it("no deja que flex recorte las tarjetas", () => {
    expect(css).toMatch(/\.chat \.messages\s*>\s*\.message[\s\S]{0,80}flex-shrink:\s*0/);
  });

  it("empuja el hilo hacia el composer cuando no hay hero", () => {
    expect(css).toMatch(/\.chat \.messages:not\(:has\(#chatIntro\)\)::before/);
  });

  it("centra Configuración con margin auto (Tailwind v4 pone margin:0 al dialog)", () => {
    expect(css).toMatch(/\.settings-dialog\s*\{[^}]*margin:\s*auto/);
  });

  it("fija el tamaño de la foto de Google en .avatar img", () => {
    expect(css).toMatch(/\.profile \.avatar img\s*\{[^}]*width:\s*30px/);
  });
});
