import Image from "next/image";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";

const SIZES = {
  xs: { box: "w-5 h-5 rounded-md", px: "20px", text: "text-[9px]", icon: 12 },
  sm: { box: "w-6 h-6 rounded-md", px: "24px", text: "text-[11px]", icon: 14 },
  lg: { box: "w-8 h-8 rounded-lg", px: "32px", text: "text-base", icon: 16 },
  xl: { box: "h-16 w-16 rounded-2xl", px: "64px", text: "text-2xl", icon: 28 },
} as const;

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category"> & { description?: string | null };
  size?: keyof typeof SIZES;
  // Overrides puntuales para contextos fuera del chat (catálogo, landing) que
  // necesitan un tamaño/estilo propio en vez de la escala fija de `size`.
  className?: string;
  sizePx?: string;
  textClassName?: string;
}

// Marca visual canónica de un GPT:
// 1. icon_url si el admin subió uno
// 2. marca geométrica del oficio (categoría o nombre/descripción)
// 3. inicial tipográfica si no hay oficio reconocible
export default function GptGlyph({ gpt, size = "sm", className, sizePx, textClassName }: Props) {
  const preset = SIZES[size];
  const { craft, Icon, accentClasses } = getGptVisual(
    gpt?.category,
    gpt?.name,
    gpt?.description
  );
  const initial = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "G";

  return (
    <span
      className={cn(
        "gpt-glyph relative flex items-center justify-center flex-shrink-0 bg-gradient-to-br border overflow-hidden",
        className || preset.box,
        accentClasses
      )}
      aria-hidden
    >
      {gpt?.icon_url ? (
        <Image src={gpt.icon_url} alt="" fill sizes={sizePx || preset.px} className="object-cover" />
      ) : craft ? (
        <Icon size={preset.icon} strokeWidth={1.75} />
      ) : (
        <span className={cn("font-display font-semibold leading-none", textClassName || preset.text)}>
          {initial}
        </span>
      )}
    </span>
  );
}
