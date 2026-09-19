import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Gpt } from "@/lib/types";
import GptGlyph from "@/components/chat/GptGlyph";
import { getGptVisual } from "@/lib/gpt-visual";

interface Props {
  gpt: Gpt;
  onSelect: (id: string) => void;
  onAccentHover: (hex: string | null) => void;
  /** Para escalonar la entrada (`animationDelay`) desde el grid. */
  style?: CSSProperties;
}

// Botón y no Link: un Link a /chat?gpt= remontaría UnifiedChat (y sus queries);
// `onSelect` cambia el GPT activo en cliente sin recargar nada.
export default function GptCard({ gpt, onSelect, onAccentHover, style }: Props) {
  const author = gpt.author?.trim() || "";
  const description = gpt.description?.trim() || "";
  const { accentHex } = getGptVisual(gpt.category, gpt.name, gpt.description);

  return (
    <button
      type="button"
      onClick={() => onSelect(gpt.id)}
      onPointerEnter={() => onAccentHover(accentHex)}
      onPointerLeave={() => onAccentHover(null)}
      onFocus={() => onAccentHover(accentHex)}
      onBlur={() => onAccentHover(null)}
      style={{ ...style, "--craft": accentHex } as CSSProperties}
      aria-label={`Abrir ${gpt.name}`}
      className="frost gpt-card group relative fade-up flex h-full min-h-[13.75rem] w-full cursor-pointer flex-col items-start rounded-3xl p-6 text-left motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.99]"
    >
      <ArrowUpRight
        size={18}
        className="gpt-card-arrow absolute right-5 top-5 text-zinc-500 transition-colors duration-200"
        aria-hidden
      />

      <GptGlyph gpt={gpt} size="xl" />

      <h3 className="font-display mt-5 line-clamp-2 pr-8 text-xl font-semibold leading-tight tracking-tight text-zinc-100">
        {gpt.name}
      </h3>
      <p
        className="mt-2 line-clamp-1 min-h-[1.25rem] text-sm leading-relaxed text-zinc-400"
        title={description || undefined}
      >
        {description || "\u00a0"}
      </p>
      <p className="mt-auto pt-6 text-xs text-zinc-500">{author ? `By ${author}` : "\u00a0"}</p>
    </button>
  );
}
