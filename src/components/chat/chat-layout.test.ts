import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const unified = readFileSync(join(here, "..", "UnifiedChat.tsx"), "utf8");
const composer = readFileSync(join(here, "Composer.tsx"), "utf8");
const bubble = readFileSync(join(here, "MessageBubble.tsx"), "utf8");
const sidebar = readFileSync(join(here, "ChatSidebar.tsx"), "utf8");
const sidebarCss = readFileSync(join(here, "sidebar.css"), "utf8");
const threads = readFileSync(join(here, "ThreadListItem.tsx"), "utf8");
const globals = readFileSync(join(here, "..", "..", "app", "globals.css"), "utf8");
const layout = readFileSync(join(here, "..", "..", "app", "layout.tsx"), "utf8");

describe("layout del chat: producto, no plantilla CSS", () => {
  it("GPT vacío centra intro + composer y no monta el scroller vacío", () => {
    expect(unified).toMatch(/showGptIntro && "justify-center"/);
    expect(unified).toMatch(/showGptIntro && \(/);
    expect(unified).toMatch(/!showGptIntro && \(/);
    expect(unified).not.toMatch(/hidden=\{showGptIntro\}/);
  });

  it("el dock no trae placa (borde/fondo/sombra) en CSS ni en markup", () => {
    const dock = globals.match(/\.chat-dock\s*\{[^}]+\}/)?.[0] ?? "";
    expect(dock).toMatch(/background:\s*none/);
    expect(dock).toMatch(/border:\s*0/);
    expect(dock).toMatch(/box-shadow:\s*none/);
    expect(dock).not.toMatch(/border-top/);
    expect(unified).toMatch(/chat-dock[^"]*!bg-transparent/);
  });

  it("composer-row es la pill y el + se pinta en idle", () => {
    expect(composer).toMatch(/className="composer-row /);
    expect(composer).toMatch(/!bg-\[#111113\]/);
    expect(composer).toMatch(/rounded-\[22px\]/);
    expect(composer).toMatch(/attach-button/);
    expect(composer).toMatch(/attachedFiles\.length === 0 && \(/);
    expect(composer).toMatch(/<Plus /);
    expect(composer).toMatch(/aria-label="Agregar archivos"/);
  });

  it("el form del composer no arrastra fondo de placa", () => {
    expect(composer).toMatch(/className=\{cn\(\s*"composer w-full !m-0 !border-0 !bg-transparent/);
    expect(composer).toMatch(/composer-shell overflow-visible !border-0 !bg-transparent/);
  });

  it("no deja bloques pulse de historial; el user bubble no es un zinc a ancho completo", () => {
    expect(unified).not.toMatch(/animate-pulse/);
    expect(bubble).toMatch(/message user ml-auto w-fit/);
    expect(unified).toMatch(/className=\{i === 0 \? "mt-auto" : undefined\}/);
  });

  it("el buscador no pinta el badge Ctrl K; el atajo sigue en el keydown", () => {
    expect(sidebar).not.toMatch(/<kbd>/);
    expect(sidebar).toMatch(/e\.key\.toLowerCase\(\) !== "k"/);
    expect(threads).toMatch(/chat-name min-w-0 line-clamp-2 whitespace-normal/);
    expect(threads).not.toMatch(/chat-name min-w-0 truncate/);
  });

  it("el chevron de colapsar está en el brandrow", () => {
    expect(sidebar).toMatch(/className="collapse"/);
    expect(sidebar).toMatch(/collapse-chevron/);
    expect(sidebar).toMatch(/Contraer panel/);
  });

  it("el look del sidebar vive en sidebar.css, no en parches de compat", () => {
    expect(layout).toMatch(/components\/chat\/sidebar\.css/);
    expect(layout).toMatch(/prototype-compat\.css[\s\S]*sidebar\.css/);
    expect(sidebarCss).toMatch(/\.app \.sidebar \.brand img\s*\{[^}]*width:\s*94px/);
    expect(sidebarCss).toMatch(/\.app \.sidebar \.brandrow \.collapse\s*\{[^}]*top:\s*10px/);
    expect(sidebarCss).toMatch(/\.app \.sidebar #navigation \.nav\s*\{[^}]*padding:\s*12px 10px/);
    expect(sidebarCss).toMatch(/\.app \.sidebar \.history \.history-item\s*\{[^}]*padding:\s*12px 10px/);
    expect(sidebarCss).toMatch(/\.app \.sidebar \.label\s*\{[^}]*letter-spacing:\s*1\.3px !important/);
    expect(sidebarCss).toMatch(/\.app \.sidebar\s*\{[^}]*padding:\s*25px 20px 25px/);
  });
});
