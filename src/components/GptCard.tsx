import type { CSSProperties, PointerEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Gpt } from "@/lib/types";
import GptGlyph from "@/components/chat/GptGlyph";
import { getGptVisual } from "@/lib/gpt-visual";

interface Props {
  gpt: Gpt;
  onSelect: (id: string) => void;
  onPreview?: (accent: string | null) => void;
  /** Para escalonar la entrada (`animationDelay`) desde el grid. */
  style?: CSSProperties;
}

// Botón y no Link: un Link a /chat?gpt= remontaría UnifiedChat (y sus queries);
// `onSelect` cambia el GPT activo en cliente sin recargar nada.
export default function GptCard({ gpt, onSelect, onPreview, style }: Props) {
  const author = gpt.author?.trim() || "";
  const description = gpt.description?.trim() || "";
  const { accentHex } = getGptVisual(gpt.category, gpt.name, gpt.description);

  // El halo de hover sigue al puntero (--mx/--my en % de la card) en vez de
  // quedar centrado fijo — mismo espíritu que el rim reactivo del prototipo,
  // sin sumar el SVG/rainbow flood que ya se descartó para este catálogo.
  function trackPointer(e: PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(gpt.id)}
      onMouseEnter={() => onPreview?.(accentHex)}
      onMouseLeave={() => onPreview?.(null)}
      onFocus={() => onPreview?.(accentHex)}
      onBlur={() => onPreview?.(null)}
      onPointerMove={trackPointer}
      style={{ ...style, "--craft": accentHex } as CSSProperties}
      aria-label={`Abrir ${gpt.name}`}
      className="gpt-card group relative fade-up flex h-full min-h-[13.75rem] w-full cursor-pointer flex-col items-start rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-left motion-safe:transition-[border-color,background-color,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.99]"
    >
      <ArrowUpRight
        size={18}
        className="gpt-card-arrow absolute right-5 top-5 text-zinc-500 transition-colors duration-200"
        aria-hidden
      />

      <GptGlyph gpt={gpt} size="xl" />

      <h3 className="mt-5 line-clamp-2 pr-8 text-base font-medium leading-snug tracking-tight text-zinc-100">
        {gpt.name}
      </h3>
      <p
        className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-normal text-zinc-400"
        title={description || undefined}
      >
        {description || "\u00a0"}
      </p>
      <p className="mt-auto pt-6 text-xs leading-normal text-zinc-500">
        {author ? `By ${author}` : "\u00a0"}
      </p>
    </button>
  );
}
