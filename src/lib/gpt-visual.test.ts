import { describe, expect, it } from "vitest";
import {
  GPT_CRAFT_ACCENTS,
  LOGO_REST_ACCENT,
  conversationStartersOf,
  getGptVisual,
  resolveGptCraft,
  type GptCraft,
} from "./gpt-visual";

const CATALOG = [
  ["Seedance Director", "Crea videos cinematográficos con Seedance", "video"],
  ["Characters", "Crea personajes consistentes en segundos.", "characters"],
  ["Locations", "Crea locaciones cinematográficas para tus videos.", "locations"],
  ["Photoshoot", "Crea fotos profesionales con Inteligencia Artificial", "photo"],
  ["CinePrompt", "Crea imágenes cinematográficas en segundos.", "images"],
  ["iPhone Look", "Crea imágenes con look de iPhone en segundos", "photo"],
  ["Luxury Prompt", "Crea imágenes premium en segundos", "images"],
  ["Kling Director", "Crea videos cinematográficos con Kling 3.0", "video"],
  ["UGC Models", "Crea modelos UGC en segundos", "characters"],
  ["UGC Director", "Crea escenas para tus videos UGC", "video"],
  ["UGC Scripts", "Crea guiones para tus videos UGC", "scripts"],
] as const;

describe("resolveGptCraft", () => {
  it("infiere el oficio de los GPTs reales aunque la categoría sea General", () => {
    for (const [name, description, craft] of CATALOG) {
      expect(resolveGptCraft("General", name, description), name).toBe(craft);
    }
  });

  it("respeta una categoría explícita por encima del nombre", () => {
    expect(resolveGptCraft("Copywriting", "Kling Director", "video")).toBe("scripts");
    expect(resolveGptCraft("Imágenes", "Algo", "")).toBe("images");
    expect(resolveGptCraft("Educación")).toBe("education");
  });

  it("cae a null cuando no hay oficio reconocible", () => {
    expect(resolveGptCraft("General", "Oráculo", "Responde lo que sea")).toBeNull();
    expect(resolveGptCraft(null, "", "")).toBeNull();
  });
});

describe("getGptVisual", () => {
  it("expone marca + placa uniforme, o Hexagon si no hay oficio", () => {
    const known = getGptVisual("General", "UGC Scripts", "Crea guiones para tus videos UGC");
    expect(known.craft).toBe("scripts");
    expect(known.label).toBe("Guiones");
    expect(known.accentClasses).toContain("text-zinc-100");
    expect(known.accentClasses).not.toMatch(/sky|emerald|rose|cyan/);

    expect(known.accentHex).toBe(GPT_CRAFT_ACCENTS.scripts);
    expect(known.markKind).toBe("scripts");
    expect(known.heroShape).toContain("rounded");

    const video = getGptVisual("General", "Seedance Director", "Crea videos cinematográficos con Seedance");
    expect(video.markKind).toBe("video");

    const unknown = getGptVisual("General", "Oráculo");
    expect(unknown.craft).toBeNull();
    expect(unknown.Icon.displayName || unknown.Icon.name).toMatch(/Hexagon/i);
    expect(unknown.accentHex).toBe(LOGO_REST_ACCENT);
    expect(unknown.markKind).toBe("gem");
  });

  it("mapea cada oficio creativo a una marca distinta, no a la misma ficha", () => {
    const kinds = [
      getGptVisual("General", "Seedance Director", "video").markKind,
      getGptVisual("General", "Photoshoot", "fotos").markKind,
      getGptVisual("General", "CinePrompt", "imágenes").markKind,
      getGptVisual("General", "Characters", "personajes").markKind,
      getGptVisual("General", "Locations", "locaciones").markKind,
      getGptVisual("General", "UGC Scripts", "guiones").markKind,
    ];
    expect(kinds).toEqual(["video", "photo", "images", "characters", "locations", "scripts"]);
    expect(new Set(kinds).size).toBe(6);
  });
});

describe("conversationStartersOf", () => {
  it("solo acepta strings no vacíos; no inventa copy si la ficha viene vacía o rota", () => {
    expect(conversationStartersOf(["  Plano secuencia de noche  ", "", "Close-up"])).toEqual([
      "Plano secuencia de noche",
      "Close-up",
    ]);
    expect(conversationStartersOf([])).toEqual([]);
    expect(conversationStartersOf(null)).toEqual([]);
    expect(conversationStartersOf("un string no es una lista")).toEqual([]);
    expect(conversationStartersOf([1, { text: "no" }, "sí"])).toEqual(["sí"]);
  });
});

describe("GPT_CRAFT_ACCENTS", () => {
  it("reparte el espectro del logo entre oficios, sin reciclar un solo hex", () => {
    const hexes = Object.values(GPT_CRAFT_ACCENTS);
    for (const hex of hexes) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(new Set(hexes).size).toBe((Object.keys(GPT_CRAFT_ACCENTS) as GptCraft[]).length);
    expect(LOGO_REST_ACCENT).toBe("#FF1B8D");
  });
});
