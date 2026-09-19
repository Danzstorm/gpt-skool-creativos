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

type CraftDef = {
  label: string;
  Icon: LucideIcon;
};

// Marcas geométricas por oficio. El catálogo real vive casi todo en categoría
// "General" y sin icon_url: el oficio se infiere del nombre/descripción.
export const GPT_CRAFTS: Record<GptCraft, CraftDef> = {
  video: { label: "Video", Icon: Clapperboard },
  photo: { label: "Foto", Icon: Camera },
  images: { label: "Imágenes", Icon: Aperture },
  characters: { label: "Personajes", Icon: ScanFace },
  locations: { label: "Locaciones", Icon: MapPinned },
  scripts: { label: "Guiones", Icon: PenLine },
  marketing: { label: "Marketing", Icon: Megaphone },
  design: { label: "Diseño", Icon: PenTool },
  sales: { label: "Ventas", Icon: Target },
  productivity: { label: "Productividad", Icon: ListTodo },
  education: { label: "Educación", Icon: GraduationCap },
};

const DEFAULT_ICON = Hexagon;

// Misma placa para todos: zinc frío + vidrio. Cero sky/emerald/rose — pelean
// con el gradiente de marca y rompen la uniformidad del grid.
export const GPT_MARK_SURFACE =
  "from-white/[0.08] to-white/[0.02] border-white/[0.12] text-zinc-100";

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
  };
}
