import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const unified = readFileSync(join(here, "..", "UnifiedChat.tsx"), "utf8");
const composer = readFileSync(join(here, "Composer.tsx"), "utf8");
const bubble = readFileSync(join(here, "MessageBubble.tsx"), "utf8");
const sidebar = readFileSync(join(here, "ChatSidebar.tsx"), "utf8");
const composerCss = readFileSync(join(here, "composer.css"), "utf8");
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
    expect(composer).toMatch(/SEND_LOOK:\s*"plain"\s*\|\s*"gradient"\s*=\s*"plain"/);
    expect(composerCss).toMatch(/#composer \.send\s*\{[^}]*background:\s*#dedee3/);
    expect(composerCss).toMatch(/#composer \.composer-row\s*\{[^}]*border-radius:\s*22px/);
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
    expect(threads).toMatch(/chat-name relative min-w-0 line-clamp-2/);
    expect(threads).toMatch(/whitespace-normal/);
    expect(threads).not.toMatch(/chat-name min-w-0 truncate/);
  });

  it("el chevron de colapsar está en el encabezado con Tailwind", () => {
    expect(sidebar).toMatch(/‹/);
    expect(sidebar).toMatch(/Contraer panel/);
    expect(sidebar).toMatch(/text-\[#666978\]/);
    expect(sidebar).toMatch(/\[scrollbar-width:none\]/);
    expect(sidebar).not.toMatch(/className="collapse"/);
    expect(sidebar).not.toMatch(/className="side-scroll"/);
    const collapseAt = sidebar.indexOf("Contraer panel");
    const newAt = sidebar.indexOf('id="new"');
    expect(collapseAt).toBeGreaterThan(-1);
    expect(newAt).toBeGreaterThan(collapseAt);
  });

  it("GPTS y CHATS scrollean juntos; el pie queda fuera con mt-auto", () => {
    expect(sidebar).toMatch(/min-h-0 flex-1 overflow-x-hidden overflow-y-auto[\s\S]*GPTs[\s\S]*Chats/);
    expect(sidebar).toMatch(/Chats[\s\S]*SidebarFooter/);
  });

  it("expandir en desktop togglea collapsed como Martin, no openSidebar", () => {
    expect(unified).toMatch(/window\.innerWidth <= 650/);
    expect(unified).toMatch(/toggleSidebarCollapsed\(\)/);
    expect(unified).toMatch(/className=\{cn\(\s*"mobile-menu"/);
    // El handler de desktop no debe caer en openSidebar cuando ya hay panel.
    const menuHandler = unified.match(
      /className=\{cn\(\s*"mobile-menu"[\s\S]*?onClick=\{\(\) => \{([\s\S]*?)\}\}/
    )?.[1];
    expect(menuHandler).toBeTruthy();
    expect(menuHandler).toMatch(/toggleSidebarCollapsed\(\)/);
    expect(menuHandler).toMatch(/openSidebar\(\)/);
    expect(menuHandler).toMatch(/closeSidebar\(\)/);
  });

  it("el look del sidebar vive en Tailwind del componente, no en sidebar.css", () => {
    expect(layout).toMatch(/chat-sidebar-fence\.css/);
    expect(layout).not.toMatch(/chat\/sidebar\.css/);
    expect(layout).toMatch(/components\/chat\/composer\.css/);
    expect(sidebar).toMatch(/chat-sidebar/);
    expect(sidebar).toMatch(/w-\[94px\]/);
    expect(sidebar).toMatch(/h-\[25px\]/);
    expect(sidebar).toMatch(/chat-sidebar-column/);
    expect(sidebar).toMatch(/text-\[22px\]/);
    expect(sidebar).toMatch(/px-2\.5 py-\[12px\]/);
    expect(sidebar).toMatch(/!tracking-\[1\.3px\]/);
    expect(layout).toMatch(/chat-sidebar-fence\.css/);
    expect(sidebar).toMatch(/navActiveClass|ffbd1626/);
    expect(sidebar).toMatch(/relative mb-\[15px\].*overflow-hidden/);
    expect(threads).toMatch(/gap-3.*px-2\.5 py-\[9px\]|px-2\.5 py-\[9px\].*gap-3/);
    expect(unified).toMatch(/pointer-events-auto/);
    expect(unified).toMatch(/z-50/);
    expect(unified).toMatch(/!visible !flex|display:\s*"flex"/);
  });
});
