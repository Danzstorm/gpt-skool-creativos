import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "prototype-compat.css"), "utf8");
const proto = readFileSync(join(here, "prototype.css"), "utf8");
const composerCss = readFileSync(
  join(here, "..", "components", "chat", "composer.css"),
  "utf8"
);
const homeCss = readFileSync(
  join(here, "..", "components", "chat", "home.css"),
  "utf8"
);
const gptIntroCss = readFileSync(
  join(here, "..", "components", "chat", "gpt-intro.css"),
  "utf8"
);
const messagesCss = readFileSync(
  join(here, "..", "components", "chat", "messages.css"),
  "utf8"
);
const layout = readFileSync(join(here, "layout.tsx"), "utf8");
const chatSidebar = readFileSync(
  join(here, "..", "components", "chat", "ChatSidebar.tsx"),
  "utf8"
);
const threadItem = readFileSync(
  join(here, "..", "components", "chat", "ThreadListItem.tsx"),
  "utf8"
);
const sidebarFooter = readFileSync(
  join(here, "..", "components", "chat", "SidebarFooter.tsx"),
  "utf8"
);
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
  it("las hojas propias cargan después del dump", () => {
    expect(layout).toMatch(
      /prototype-compat\.css[\s\S]*composer\.css[\s\S]*home\.css[\s\S]*gpt-intro\.css[\s\S]*messages\.css/
    );
    expect(layout).not.toMatch(/sidebar\.css/);
    expect(composerCss).toMatch(/#composer \.send\s*\{[^}]*background:\s*#dedee3/);
  });

  it("no deja que flex recorte las tarjetas", () => {
    expect(messagesCss).toMatch(/\.chat \.messages\s*>\s*\.message[\s\S]{0,80}flex-shrink:\s*0/);
  });

  it("empuja el hilo hacia el composer con margin-top:auto en el primer hijo", () => {
    expect(messagesCss).toMatch(/#chatView\.chat-has-messages \.messages\s*>\s*:first-child[\s\S]{0,40}margin-top:\s*auto/);
  });

  it("centra #chatIntro como hermano del composer; el scroller no monta vacío", () => {
    expect(chat).toMatch(/showGptIntro && \(/);
    expect(chat).toMatch(/!showGptIntro && \(/);
    expect(chat).toMatch(/showGptIntro && "justify-center"/);
    expect(chat).not.toMatch(/hidden=\{showGptIntro\}/);
    expect(chat).toMatch(/hasChatMessages && "chat-has-messages"/);
    expect(gptIntroCss).toMatch(
      /#chatIntro \.gpt-title-row\s*\{[^}]*flex-direction:\s*row/
    );
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-title-row \.brand-energy\s*\{[^}]*margin:\s*0/);
  });

  it("el hilo no pinta skeletons pulse; el primer mensaje se acerca al composer", () => {
    expect(chat).not.toMatch(/animate-pulse/);
    expect(chat).toMatch(/className=\{i === 0 \? "mt-auto" : undefined\}/);
  });

  it("el dock no es una placa; el recuadro vive en composer-row", () => {
    expect(chat).toMatch(/chat-dock[^"]*!bg-transparent/);
    expect(chat).toMatch(/chat-dock[^"]*!border-0/);
    expect(composer).toMatch(/composer-row[\s\S]{0,180}!bg-\[#111113\]/);
    expect(composer).toMatch(/attach-button/);
    expect(composer).toMatch(/<Plus /);
  });

  it("restaura espacios en copy del intro y chrome (sin zoom)", () => {
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-title-row h1\s*\{[^}]*letter-spacing:\s*-0\.5px/);
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-intro-copy[\s\S]{0,240}word-spacing:\s*normal/);
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-title-row h1:after\s*\{[^}]*letter-spacing:\s*-0\.5px/);
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-title-row h1:after\s*\{[^}]*word-spacing:\s*normal/);
    expect(gptIntroCss).toMatch(/#chatIntro \.gpt-title-row\s*\{[^}]*translateX\(-8px\)/);
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

  it("el home intro usa el saludo como h1, no Qué vas a crear hoy", () => {
    expect(chat).toMatch(/Bienvenido de nuevo, \$\{firstName\}\./);
    expect(chat).toMatch(/Bienvenido de nuevo\./);
    expect(chat).toMatch(/Elige tu asistente creativo para empezar a crear\./);
    expect(chat).not.toMatch(/¿Qué vas a crear hoy\?/);
    expect(chat).toMatch(/<h1[\s\S]*Bienvenido de nuevo/);
    expect(chat).not.toMatch(/className="eyebrow"/);
    expect(chat).toMatch(/letterSpacing:\s*["']-1\.3px["']/);
    expect(chat).toMatch(/fontWeight:\s*300/);
    expect(chat).toMatch(/margin:\s*["']0 0 15px["']/);
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
    expect(chrome).toMatch(/!slot\?\.isConnected/);
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

  it("el RSC de Resumen no pasa funciones format al chart client", () => {
    expect(adminPage).not.toMatch(/format:\s*formatCount/);
    expect(adminPage).not.toMatch(/format:\s*money\b/);
    expect(adminPage).not.toMatch(/format:\s*\(n\)\s*=>/);
    expect(adminPage).toMatch(/format:\s*"count"/);
    expect(adminPage).toMatch(/format:\s*"money"/);
    expect(adminPage).toMatch(/format:\s*"percent"/);
    const chart = readFileSync(
      join(here, "..", "components", "admin", "AdminChartPanel.tsx"),
      "utf8"
    );
    expect(chart).toMatch(/format:\s*ChartFormat/);
    expect(chart).not.toMatch(/format:\s*\(n:\s*number\)\s*=>/);
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

  it("fija el tamaño de la foto de Google en el footer con Tailwind", () => {
    expect(sidebarFooter).toMatch(/h-\[30px\] w-\[30px\]/);
    expect(sidebarFooter).toMatch(/rounded-full object-cover/);
  });

  it("el wordmark del sidebar es 94×25 con contraste, no 128", () => {
    expect(chatSidebar).toMatch(/width=\{94\}/);
    expect(chatSidebar).toMatch(/height=\{25\}/);
    expect(chatSidebar).toMatch(/w-\[94px\]/);
    expect(chatSidebar).toMatch(/h-\[25px\]/);
    expect(chatSidebar).toMatch(/top-2\.5 left-2/);
    expect(chatSidebar).toMatch(/\[filter:none\]/);
    expect(chatSidebar).not.toMatch(/width=\{128\}/);
    expect(chatSidebar).not.toMatch(/className="sidebar"/);
    expect(chatSidebar).not.toMatch(/className="brand"/);
  });

  it("el footer usa foto 30px si hay avatar; si no, iniciales", () => {
    expect(sidebarFooter).toMatch(/initialsOf\(fullName, email\)/);
    expect(sidebarFooter).toMatch(/showAvatar \?/);
    expect(sidebarFooter).toMatch(/width=\{30\}/);
    expect(sidebarFooter).toMatch(/height=\{30\}/);
    expect(sidebarFooter).toMatch(/h-\[30px\] w-\[30px\]/);
    expect(sidebarFooter).not.toMatch(/className="profile"/);
  });

  it("Nuevo chat recupera borde visible con Tailwind, no clase .new del dump", () => {
    expect(chatSidebar).toMatch(/border-white\/\[0\.09\]/);
    expect(chatSidebar).toMatch(/Nuevo chat/);
    expect(chatSidebar).not.toMatch(/className="new tool"/);
  });

  it("CHATS usa line-clamp-2, no nowrap agresivo", () => {
    expect(threadItem).toMatch(/line-clamp-2/);
    expect(threadItem).toMatch(/whitespace-normal/);
    expect(threadItem).not.toMatch(/chat-name min-w-0 truncate/);
  });

  it("el chevron de colapsar queda visible con Tailwind en el brandrow", () => {
    expect(chatSidebar).toMatch(/‹/);
    expect(chatSidebar).toMatch(/text-\[#666978\]/);
    expect(chatSidebar).toMatch(/text-\[22px\]/);
    expect(chatSidebar).toMatch(/\[-webkit-text-fill-color:#666978\]/);
    expect(chatSidebar).toMatch(/\[scrollbar-width:none\]/);
    expect(chatSidebar).toMatch(/px-2\.5 py-3/);
    expect(chatSidebar).toMatch(/!tracking-\[1\.3px\]/);
    expect(chatSidebar).toMatch(/duration-\[320ms\].*ease-\[cubic-bezier\(0\.4,0,0\.2,1\)\]/);
    expect(chatSidebar).toMatch(/mb-9/);
    expect(chatSidebar).not.toMatch(/className="side-scroll"/);
    expect(chatSidebar).not.toMatch(/className="collapse"/);
    expect(layout).not.toMatch(/sidebar\.css/);
  });

  it("expandir desde el borde usa z-index y pointer-events en UnifiedChat", () => {
    expect(chat).toMatch(/sidebarCollapsed && "relative z-50/);
    expect(chat).toMatch(/pointer-events-auto/);
    expect(chat).toMatch(/toggleSidebarCollapsed\(\)/);
  });

  it("el menú de cuenta se porta a body como Martin; la música es el segundo panel", () => {
    const footer = readFileSync(
      join(here, "..", "components", "chat", "SidebarFooter.tsx"),
      "utf8"
    );
    const music = readFileSync(
      join(here, "..", "components", "chat", "MusicMenu.tsx"),
      "utf8"
    );
    expect(footer).toMatch(/createPortal\(/);
    expect(footer).toMatch(/positionAccountMenuBox/);
    expect(footer).toMatch(/document\.body/);
    expect(music).toMatch(/id="musicToggle"/);
    expect(music).toMatch(/className="music-options"/);
    expect(music).toMatch(/className="music-equalizer"/);
    expect(music).toMatch(/className="music-volume"/);
    expect(music).toMatch(/data-music=\{index\}/);
    expect(music).toMatch(/musicPanelPlacement/);
    expect(music).toMatch(/mergeMusicTracks/);
    expect(music).not.toMatch(/createPortal/);
    expect(music).not.toMatch(/music-flyout/);
    expect(css).toMatch(/\.account-menu \.music-options\[hidden\]/);
  });
});

describe("prototype-compat: catálogo de home scrollea", () => {
  it("el prototipo recorta: .app overflow hidden y grilla de 3 filas", () => {
    expect(proto).toMatch(/\.app\{[^}]*overflow:hidden/);
    expect(proto).toMatch(/\.grid\{grid-template-rows:repeat\(3,/);
  });

  it("home scrollea en .main; #homeView crece sin overflow anidado", () => {
    expect(css).toMatch(/\.app\s*\{[^}]*overflow:\s*hidden/);
    expect(homeCss).toMatch(/\.main:has\(#homeView\)\s*\{[^}]*overflow-y:\s*auto/);
    expect(homeCss).toMatch(/#homeView\.workspace\s*\{[^}]*overflow:\s*visible/);
    expect(homeCss).toMatch(/#homeView\.workspace\s*\{[^}]*height:\s*auto/);
  });

  it("no re-rompe el scroll del chat ni el composer", () => {
    expect(css).toMatch(/\.main:has\(#chatView\)\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/#chatView\.chat[\s\S]{0,80}overflow:\s*hidden/);
    expect(messagesCss).toMatch(/\.chat \.messages\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("la grilla no queda clavada a 3 filas (9, 12 y 20 GPTs caben)", () => {
    expect(homeCss).toMatch(/\.workspace \.grid\s*\{[^}]*grid-template-rows:\s*none/);
    expect(homeCss).toMatch(/\.workspace \.grid\s*\{[^}]*grid-auto-rows:\s*minmax\(142px,\s*auto\)/);
  });

  it("home copia gaps/padding de Martin: filtros, search discreto, tool 21×20", () => {
    expect(homeCss).toMatch(/\.app #homeView \.filters\s*\{[^}]*gap:\s*7px/);
    expect(homeCss).toMatch(
      /\.app #homeView \.filters button\.filter\[aria-pressed=["']true["']\]\s*\{[^}]*border-color:\s*#ed4f7025/
    );
    expect(homeCss).toMatch(/\.app #homeView \.search\s*\{[^}]*width:\s*205px/);
    expect(homeCss).toMatch(/\.app #homeView \.search\s*\{[^}]*background:\s*#ffffff02/);
    expect(homeCss).toMatch(/#homeView \.tool\s*\{[^}]*padding:\s*21px 20px/);
    expect(homeCss).toMatch(/#homeView \.tool \.edge-wrap\s*\{[^}]*opacity:\s*0/);
    expect(homeCss).toMatch(/#homeView \.tool p\s*\{[^}]*-webkit-line-clamp:\s*2/);
  });

  it("GptCatalog pinta filtered.map, sin tope de 9, dentro de #homeView", () => {
    expect(catalog).not.toMatch(/capCatalogList|HERO_GPT_PREVIEW_LIMIT|slice\(\s*0\s*,\s*9\s*\)/);
    expect(catalog).toMatch(/activeGptsForChat/);
    expect(catalog).toMatch(/filtered\.map/);
    expect(chat).toMatch(/id="homeView"\s+className="workspace"/);
    expect(chat).toMatch(/<GptCatalog gpts=\{gpts\}/);
    expect(chat).toMatch(/onOpenAllGpts=\{openAllGpts\}/);
  });
});
