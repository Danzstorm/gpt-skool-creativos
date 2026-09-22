import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "prototype-compat.css"), "utf8");
const proto = readFileSync(join(here, "prototype.css"), "utf8");
const catalog = readFileSync(
  join(here, "..", "components", "GptCatalog.tsx"),
  "utf8"
);
const chat = readFileSync(
  join(here, "..", "components", "UnifiedChat.tsx"),
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

describe("prototype-compat: catálogo de home scrollea", () => {
  it("el prototipo recorta: .app overflow hidden y grilla de 3 filas", () => {
    expect(proto).toMatch(/\.app\{[^}]*overflow:hidden/);
    expect(proto).toMatch(/\.grid\{grid-template-rows:repeat\(3,/);
  });

  it("home scrollea en .main; el shell .app sigue clipped para el chat", () => {
    expect(css).toMatch(/\.app\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.main:has\(#homeView\)\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/#homeView\.workspace\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/#homeView\.workspace\s*\{[^}]*height:\s*auto/);
  });

  it("no re-rompe el scroll del chat ni el composer", () => {
    expect(css).toMatch(/\.main:has\(#chatView\)\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/#chatView\.chat[\s\S]{0,80}overflow:\s*hidden/);
    expect(css).toMatch(/\.chat \.messages\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("la grilla no queda clavada a 3 filas (9, 12 y 20 GPTs caben)", () => {
    expect(css).toMatch(/\.workspace \.grid\s*\{[^}]*grid-template-rows:\s*none/);
    expect(css).toMatch(/\.workspace \.grid\s*\{[^}]*grid-auto-rows:\s*minmax\(142px,\s*auto\)/);
  });

  it("GptCatalog pinta filtered.map, sin tope de 9, dentro de #homeView", () => {
    expect(catalog).not.toMatch(/capCatalogList|HERO_GPT_PREVIEW_LIMIT|slice\(\s*0\s*,\s*9\s*\)/);
    expect(catalog).toMatch(/filtered\.map/);
    expect(chat).toMatch(/id="homeView"\s+className="workspace"/);
    expect(chat).toMatch(/<GptCatalog\b/);
  });
});
