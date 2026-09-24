import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activeGptsForChat } from "./gpt-catalog";
import { SIDEBAR_GPT_LIMIT } from "./gpt-recents";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...parts: string[]) => readFileSync(join(here, "..", ...parts), "utf8");

function gpt(id: string, sort_order: number, is_active = true) {
  return { id, is_active, sort_order };
}

describe("activeGptsForChat", () => {
  it("N activos => N items, inactivos fuera, sin tope de 9", () => {
    const gpts = [
      gpt("dead", 0, false),
      ...Array.from({ length: 11 }, (_, i) => gpt(`g${i + 1}`, 20 - i)),
      gpt("also-dead", 99, false),
    ];
    const listed = activeGptsForChat(gpts);
    expect(listed).toHaveLength(11);
    expect(listed.map((item) => item.id)).toEqual([
      "g11",
      "g10",
      "g9",
      "g8",
      "g7",
      "g6",
      "g5",
      "g4",
      "g3",
      "g2",
      "g1",
    ]);
    expect(listed.every((item) => item.is_active)).toBe(true);
  });

  it("no recorta cuando hay más de 9 activos", () => {
    const gpts = Array.from({ length: 20 }, (_, i) => gpt(`g${i}`, i));
    expect(activeGptsForChat(gpts)).toHaveLength(20);
  });
});

describe("chat home vs sidebar", () => {
  const catalog = src("components", "GptCatalog.tsx");
  const chat = src("components", "UnifiedChat.tsx");
  const sidebar = src("components", "chat", "ChatSidebar.tsx");
  const page = src("app", "(protected)", "chat", "page.tsx");

  it("el catálogo pinta todos los filtrados, sin cap de prototipo", () => {
    expect(catalog).toMatch(/activeGptsForChat/);
    expect(catalog).toMatch(/filtered\.map/);
    expect(catalog).not.toMatch(/capCatalogList|HERO_GPT_PREVIEW_LIMIT|slice\(\s*0\s*,\s*9\s*\)/);
  });

  it("home recibe la lista completa de activos; el sidebar 5 fijos + activo", () => {
    expect(page).toMatch(/gpts_public/);
    expect(page).toMatch(/is_active/);
    expect(page).toMatch(/sort_order/);
    expect(page).toMatch(/activeGptsForChat/);
    expect(chat).toMatch(/<GptCatalog gpts=\{gpts\}/);
    expect(chat).toMatch(/pickSidebarGpts\(gpts, activeGptId\)/);
    expect(chat).toMatch(/recentGpts=\{recentGpts\}/);
    expect(sidebar).toMatch(/recentGpts\.map/);
    expect(sidebar).not.toMatch(/indices\s*=\s*\[0,\s*1,\s*2,\s*3,\s*4\]/);
    expect(sidebar).not.toMatch(/gpts\.slice\(/);
  });

  it("Todos los GPTs abre el home completo, no un subset", () => {
    expect(SIDEBAR_GPT_LIMIT).toBe(5);
    expect(sidebar).toMatch(/id="allNav"/);
    expect(sidebar).toMatch(/onClick=\{onOpenAllGpts\}/);
    expect(sidebar).toMatch(/Todos los GPTs/);
    expect(chat).toMatch(/onOpenAllGpts=\{openAllGpts\}/);
    expect(chat).toMatch(/openAllGpts = useCallback\(\(\) => \{\s*newChatWorkspace\(\)/);
    expect(chat).toMatch(/!activeGpt && \(/);
    expect(chat).toMatch(/id="homeView"\s+className="workspace"/);
    expect(chat).toMatch(/<GptCatalog gpts=\{gpts\}/);
    expect(sidebar).toMatch(/recentGpts\.map/);
    expect(sidebar).not.toMatch(/gpts\.slice\(/);
  });
});

describe("CRUD admin invalida el catálogo de /chat", () => {
  it("create/update/delete/duplicate llaman revalidateChatGpts", () => {
    expect(src("lib", "revalidate-chat-gpts.ts")).toMatch(/revalidatePath\("\/chat"\)/);
    expect(src("app", "api", "admin", "gpts", "route.ts")).toMatch(/revalidateChatGpts\(\)/);
    expect(src("app", "api", "admin", "gpts", "[id]", "route.ts")).toMatch(/revalidateChatGpts\(\)/);
    expect(src("app", "api", "admin", "gpts", "[id]", "duplicate", "route.ts")).toMatch(
      /revalidateChatGpts\(\)/
    );
  });
});
