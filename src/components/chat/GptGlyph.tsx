import Image from "next/image";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";

const SIZES = {
  xs: { box: "w-5 h-5 rounded-md", px: "20px", text: "text-[9px]" },
  sm: { box: "w-6 h-6 rounded-md", px: "24px", text: "text-[11px]" },
  lg: { box: "w-8 h-8 rounded-lg", px: "32px", text: "text-base" },
  xl: { box: "w-16 h-16 rounded-2xl", px: "64px", text: "text-2xl" },
} as const;

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category">;
  size?: keyof typeof SIZES;
  // Overrides puntuales para contextos fuera del chat (catálogo, landing) que
  // necesitan un tamaño/estilo propio en vez de la escala fija de `size`.
  className?: string;
  sizePx?: string;
  textClassName?: string;
}

// Marca visual canónica de un GPT: si tiene icon_url usa la imagen, si no
// muestra su inicial en serif sobre el gradiente de su categoría.
export default function GptGlyph({ gpt, size = "sm", className, sizePx, textClassName }: Props) {
  const preset = SIZES[size];
  const { accentClasses } = getGptVisual(gpt?.category);
  const initial = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "•";
  return (
    <span
      className={cn(
        "relative flex items-center justify-center flex-shrink-0 bg-gradient-to-br border overflow-hidden",
        className || preset.box,
        accentClasses
      )}
    >
      {gpt?.icon_url ? (
        <Image src={gpt.icon_url} alt="" fill sizes={sizePx || preset.px} className="object-cover" />
      ) : (
        <span className={cn("font-display font-semibold leading-none", textClassName || preset.text)}>
          {initial}
        </span>
      )}
    </span>
  );
}
