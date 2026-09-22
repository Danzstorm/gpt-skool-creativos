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
const hero = readFileSync(
  join(here, "..", "components", "chat", "GptHero.tsx"),
  "utf8"
);
const composer = readFileSync(
  join(here, "..", "components", "chat", "Composer.tsx"),
  "utf8"
);
const chrome = readFileSync(
  join(here, "..", "components", "admin", "AdminChrome.tsx"),
  "utf8"
);
const adminPage = readFileSync(join(here, "admin", "page.tsx"), "utf8");

describe("prototype-compat: chat y chrome", () => {
  it("no deja que flex recorte las tarjetas", () => {
    expect(css).toMatch(/\.chat \.messages\s*>\s*\.message[\s\S]{0,80}flex-shrink:\s*0/);
  });

  it("empuja el hilo hacia el composer con margin-top:auto en el primer hijo", () => {
    expect(css).toMatch(/#chatView\.chat-has-messages \.messages\s*>\s*:first-child[\s\S]{0,40}margin-top:\s*auto/);
  });

  it("centra #chatIntro como hermano de .messages, no hijo", () => {
    expect(chat).toMatch(/showGptIntro && \(/);
    expect(chat).toMatch(/hidden=\{showGptIntro\}/);
    expect(chat).toMatch(/className=\{hasChatMessages \? "chat chat-has-messages" : "chat"\}/);
    expect(css).toMatch(
      /#chatView:has\(#chatIntro:not\(\[hidden\]\)\)\s*\{[^}]*justify-content:\s*center/
    );
    expect(css).toMatch(
      /#chatView:has\(#chatIntro:not\(\[hidden\]\)\) #chatIntro\s*\{[^}]*flex-shrink:\s*0/
    );
    expect(css).toMatch(
      /#chatView:has\(#chatIntro:not\(\[hidden\]\)\) \.messages\s*\{[^}]*display:\s*none/
    );
    expect(css).toMatch(
      /#chatIntro \.gpt-title-row\s*\{[^}]*flex-direction:\s*row/
    );
    expect(css).toMatch(/#chatIntro \.gpt-title-row \.brand-energy\s*\{[^}]*margin:\s*0/);
  });

  it("restaura espacios en copy del intro y chrome (sin zoom)", () => {
    expect(css).toMatch(/#chatIntro p[\s\S]{0,500}word-spacing:\s*0\.06em/);
    expect(css).toMatch(/\.chat-intro p[\s\S]{0,400}word-spacing:\s*0\.06em/);
    expect(css).toMatch(/#chatIntro \.gpt-title-row h1:after\s*\{[^}]*word-spacing:\s*0\.06em/);
    expect(css).not.toMatch(/zoom\s*:/);
    expect(proto).not.toMatch(/zoom\s*:/);
  });

  it("el footer de cuenta no inventa email; el prototipo pone Espacio creativo", () => {
    const footer = readFileSync(
      join(here, "..", "components", "chat", "SidebarFooter.tsx"),
      "utf8"
    );
    expect(footer).toMatch(/Espacio creativo/);
    expect(footer).not.toMatch(/subline = personName \? email/);
    expect(footer).not.toMatch(/<span>\{email\}/);
  });

  it("el disclaimer del composer es markup nuclear, no note/compose-hint", () => {
    expect(composer).not.toMatch(/className="note compose-hint"/);
    expect(composer).toMatch(/hideDisclaimer/);
    expect(composer).toMatch(/WebkitTextFillColor:\s*["']#62626b["']/);
    expect(composer).toMatch(/wordSpacing:\s*["']0\.12em["']/);
    expect(composer).toMatch(/whiteSpace:\s*["']pre-wrap["']/);
    expect(composer).toMatch(/letterSpacing:\s*0/);
    expect(chat).toMatch(/hideDisclaimer=\{showGptIntro\}/);
  });

  it("el h1 global ya no clippea todo el documento", () => {
    expect(proto).not.toMatch(/letter-spacing:\.3px\}h1\{[^}]*background-clip:text/);
    expect(proto).toMatch(/\.intro h1,#homeView h1,\.access-title-row h1\{[^}]*background-clip:text/);
    expect(hero).toMatch(/WebkitTextFillColor:\s*["']#8e909c["']/);
    expect(hero).toMatch(/color:\s*["']#8e909c["']/);
  });

  it("muestra el breadcrumb del hilo solo con mensajes", () => {
    expect(chat).toMatch(/id="breadcrumb"/);
    expect(chat).toMatch(/hasChatMessages && \(/);
    expect(css).toMatch(/\.main:has\(#chatView\.chat-has-messages\) #breadcrumb/);
  });

  it("el reset button/svg del prototipo ya no es global: Next usa Tailwind", () => {
    expect(proto).not.toMatch(/focus-visible\{[^}]+\}button\{background:none;border:0\}svg\{width:19px/);
    expect(proto).toMatch(/\.app \.sidebar button/);
  });

  it("el nav admin va en .ax-navigation y los CTA usan .ax-primary fuera de .ax-tw", () => {
    expect(chrome).toMatch(/className="ax-navigation"/);
    expect(chrome).toMatch(/AdminHeaderActions/);
    expect(chrome).toMatch(/href: "\/admin\/gpts"/);
    expect(chrome.indexOf('href: "/admin/gpts"')).toBeLessThan(chrome.indexOf('href: "/admin/members"'));
    expect(chrome).toMatch(/＋ Importar miembros/);
    expect(chrome).toMatch(/isDashboard/);
    expect(chrome).toMatch(/!isDashboard &&/);
    expect(css).toMatch(/\.ax-shell button\[class\*=["']bg-/);
    expect(css).toMatch(/button\.ax-primary[\s\S]{0,300}background:\s*linear-gradient/);
  });

  it("el Resumen usa Panel de control, pills 7/30/90 y series reales", () => {
    expect(adminPage).toMatch(/Panel de control/);
    expect(adminPage).toMatch(/ax-summary-top/);
    expect(adminPage).toMatch(/ax-range-caption/);
    expect(adminPage).toMatch(/buildDailySeries/);
    expect(adminPage).not.toMatch(/Math\.sin/);
    expect(adminPage).toMatch(/title="Uso"/);
    expect(adminPage).toMatch(/title="Costos"/);
  });

  it("el catálogo admin de GPTs usa cards ax-gpt con métricas reales, no senos del mock", () => {
    const gptsPage = readFileSync(join(here, "admin", "gpts", "page.tsx"), "utf8");
    expect(gptsPage).toMatch(/ax-catalog/);
    expect(gptsPage).toMatch(/ax-gpt-metrics/);
    expect(gptsPage).toMatch(/mapGptCatalogMetrics/);
    expect(gptsPage).toMatch(/Uso por herramienta · últimos 30 días/);
    expect(gptsPage).toMatch(/＋ Nuevo GPT/);
    expect(gptsPage).toMatch(/GptTestModal/);
    expect(gptsPage).toMatch(/\/duplicate/);
    expect(gptsPage).not.toMatch(/\[62,\s*48,\s*39,\s*35,\s*28\]/);
    expect(gptsPage).not.toMatch(/Math\.sin/);
  });

  it("GptHero sigue pintando .examples y gpt-title-row", () => {
    expect(hero).toMatch(/className="gpt-title-row"/);
    expect(hero).toMatch(/className="examples"/);
    expect(hero).toMatch(/conversation_starters/);
  });

  it("centra Configuración con margin auto (Tailwind v4 pone margin:0 al dialog)", () => {
    expect(css).toMatch(/\.settings-dialog\s*\{[^}]*margin:\s*auto/);
  });

  it("fija el tamaño de la foto de Google en .avatar img", () => {
    expect(css).toMatch(/\.profile \.avatar img\s*\{[^}]*width:\s*30px/);
  });

  it("el wordmark del sidebar es 128×34 con contraste", () => {
    const sidebar = readFileSync(
      join(here, "..", "components", "chat", "ChatSidebar.tsx"),
      "utf8"
    );
    expect(sidebar).toMatch(/width=\{128\}/);
    expect(sidebar).toMatch(/height=\{34\}/);
    expect(css).toMatch(/\.app \.sidebar \.brand img\s*\{[^}]*filter:\s*brightness\(1\.55\)/);
  });
});

describe("prototype-compat: catálogo de home scrollea", () => {
  it("el prototipo recorta: .app overflow hidden y grilla de 3 filas", () => {
    expect(proto).toMatch(/\.app\{[^}]*overflow:hidden/);
    expect(proto).toMatch(/\.grid\{grid-template-rows:repeat\(3,/);
  });

  it("home scrollea en .main; #homeView crece sin overflow anidado", () => {
    expect(css).toMatch(/\.app\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.main:has\(#homeView\)\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/#homeView\.workspace\s*\{[^}]*overflow:\s*visible/);
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
