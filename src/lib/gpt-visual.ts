import {
  Aperture,
  Camera,
  Clapperboard,
  GraduationCap,
  Hexagon,
  ListTodo,
  MapPinned,
  Megaphone,
  PenLine,
  PenTool,
  ScanFace,
  Target,
  type LucideIcon,
} from "lucide-react";

export type GptCraft =
  | "video"
  | "photo"
  | "images"
  | "characters"
  | "locations"
  | "scripts"
  | "marketing"
  | "design"
  | "sales"
  | "productivity"
  | "education";

/** Badge de catálogo/sidebar (px). El empty-state 3D sigue en GptMark (xl). */
export const GPT_LOGO_PX = { xs: 28, md: 64 } as const;

/** Emblema de oficio: empty-state (GptMark 3D) y catálogo/sidebar (GptLogo). */
export type GptMarkKind =
  | "video"
  | "photo"
  | "images"
  | "characters"
  | "locations"
  | "scripts"
  | "gem";

type CraftDef = {
  label: string;
  Icon: LucideIcon;
  markKind: GptMarkKind;
  heroShape: string;
};

// Marcas geométricas por oficio. El catálogo real vive casi todo en categoría
// "General" y sin icon_url: el oficio se infiere del nombre/descripción.
export const GPT_CRAFTS: Record<GptCraft, CraftDef> = {
  video: { label: "Video", Icon: Clapperboard, markKind: "video", heroShape: "rounded-[1.75rem]" },
  photo: { label: "Foto", Icon: Camera, markKind: "photo", heroShape: "rounded-full" },
  images: { label: "Imágenes", Icon: Aperture, markKind: "images", heroShape: "rounded-full" },
  characters: { label: "Personajes", Icon: ScanFace, markKind: "characters", heroShape: "rounded-[2rem]" },
  locations: { label: "Locaciones", Icon: MapPinned, markKind: "locations", heroShape: "rounded-full" },
  scripts: { label: "Guiones", Icon: PenLine, markKind: "scripts", heroShape: "rounded-xl" },
  marketing: { label: "Marketing", Icon: Megaphone, markKind: "gem", heroShape: "rounded-2xl" },
  design: { label: "Diseño", Icon: PenTool, markKind: "gem", heroShape: "rounded-2xl" },
  sales: { label: "Ventas", Icon: Target, markKind: "gem", heroShape: "rounded-2xl" },
  productivity: { label: "Productividad", Icon: ListTodo, markKind: "gem", heroShape: "rounded-2xl" },
  education: { label: "Educación", Icon: GraduationCap, markKind: "gem", heroShape: "rounded-2xl" },
};

const DEFAULT_HERO_SHAPE = "rounded-[1.75rem]";
const DEFAULT_MARK_KIND: GptMarkKind = "gem";

const DEFAULT_ICON = Hexagon;

// Placa en reposo: zinc + vidrio para todos. El color de oficio vive en
// `accentHex` (espectro muestreado del logo) y solo se enciende en hover/selected.
export const GPT_MARK_SURFACE =
  "from-white/[0.08] to-white/[0.02] border-white/[0.12] text-zinc-100";

// Banda dominante del JPG: magenta/rosa (~#FF1B8D), no el ámbar del borde.
// El velo en reposo y el halo del orb salen de acá.
export const LOGO_REST_ACCENT = "#FF1B8D";

// Stops del logo (ámbar → naranja → rojo → magenta → fucsia → violeta → índigo)
// repartidos por oficio. Distintos en hover; misma familia que el wordmark.
export const GPT_CRAFT_ACCENTS: Record<GptCraft, string> = {
  video: "#FF1B8D",
  photo: "#FF2D9A",
  images: "#FF1A58",
  characters: "#E000D8",
  locations: "#5B3CFF",
  scripts: "#FF9A1A",
  marketing: "#FF6D1A",
  design: "#C000FF",
  sales: "#FF003C",
  productivity: "#A91EFF",
  education: "#4A44FE",
};

export function craftAccentHex(craft: GptCraft | null | undefined): string {
  return craft ? GPT_CRAFT_ACCENTS[craft] : LOGO_REST_ACCENT;
}

const CATEGORY_CRAFT: Record<string, GptCraft> = {
  video: "video",
  imagenes: "images",
  imagen: "images",
  marketing: "marketing",
  copywriting: "scripts",
  copy: "scripts",
  diseno: "design",
  design: "design",
  ventas: "sales",
  productividad: "productivity",
  educacion: "education",
};

// Primero lo más específico. "UGC Scripts" menciona videos en la descripción
// pero el oficio es guión; "iPhone Look" menciona imágenes pero el oficio es foto.
const NAME_PATTERNS: { craft: GptCraft; re: RegExp }[] = [
  { craft: "scripts", re: /\b(script|guion|copywrit|copywriter|redacc)/ },
  { craft: "characters", re: /\b(character|personaje|modelos?\b|models\b)/ },
  { craft: "locations", re: /\b(location|locacion|locaciones|escenario)/ },
  { craft: "photo", re: /\b(photoshoot|photosh|fotos?\b|iphone)/ },
  { craft: "video", re: /\b(director|video|kling|seedance|escenas?\b|reel)/ },
  { craft: "images", re: /\b(imagen|image|cineprompt|luxury prompt|\bcine\b|prompt)/ },
  { craft: "marketing", re: /\b(marketing|anuncio|ads\b|campana)/ },
  { craft: "design", re: /\b(diseno|design|brand|logo)/ },
  { craft: "sales", re: /\b(venta|sales|closer)/ },
  { craft: "education", re: /\b(educacion|curso|escuela|tutor|academia)/ },
  { craft: "productivity", re: /\b(productiv|organiz|workflow)/ },
];

export function foldGptText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resolveGptCraft(
  category?: string | null,
  name?: string | null,
  description?: string | null
): GptCraft | null {
  const cat = foldGptText(category ?? "").trim();
  if (cat && cat !== "general" && CATEGORY_CRAFT[cat]) {
    return CATEGORY_CRAFT[cat];
  }

  const haystack = foldGptText(`${name ?? ""} ${description ?? ""}`);
  for (const { craft, re } of NAME_PATTERNS) {
    if (re.test(haystack)) return craft;
  }
  return null;
}

export function getGptVisual(
  category: string | null | undefined,
  name?: string | null,
  description?: string | null
) {
  const craft = resolveGptCraft(category, name, description);
  const def = craft ? GPT_CRAFTS[craft] : null;
  return {
    craft,
    label: def?.label ?? null,
    Icon: def?.Icon ?? DEFAULT_ICON,
    accentClasses: GPT_MARK_SURFACE,
    accentHex: craftAccentHex(craft),
    markKind: def?.markKind ?? DEFAULT_MARK_KIND,
    heroShape: def?.heroShape ?? DEFAULT_HERO_SHAPE,
  };
}

/** Starters de la ficha. No inventa copy: si la DB manda basura o un string, no hay chips. */
export function conversationStartersOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
