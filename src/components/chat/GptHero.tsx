import type { CSSProperties, ReactNode } from "react";
import type { Gpt } from "@/lib/types";
import { conversationStartersOf, getGptVisual } from "@/lib/gpt-visual";
import GptMark from "./GptMark";

interface Props {
  gpt: Gpt;
  onStarter: (text: string) => void;
  children?: ReactNode;
}

// Empty-state del GPT activo. El protagonista es la marca de vidrio del oficio,
// no el orb de Creativos ni un icono Lucide. Starters solo si la ficha ya los trae.
export default function GptHero({ gpt, onStarter, children }: Props) {
  const { label, accentHex, markKind } = getGptVisual(gpt.category, gpt.name, gpt.description);
  const starters = conversationStartersOf(gpt.conversation_starters);
  const description = gpt.description?.trim() || "";
  const author = gpt.author?.trim() || "";
  const letter = gpt.name?.trim()?.charAt(0)?.toUpperCase() || "G";

  return (
    <div
      className="gpt-hero flex min-h-full w-full max-w-2xl mx-auto flex-col items-center justify-center px-1 py-10 text-center"
      style={{ "--craft": accentHex } as CSSProperties}
    >
      <GptMark kind={markKind} letter={letter} size="xl" className="mb-8" />

      {label && <p className="eyebrow mb-3 text-zinc-400">{label}</p>}
      <h3 className="font-display text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl">
        {gpt.name}
      </h3>
      {description && (
        <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-300">{description}</p>
      )}
      {author && <p className="mt-2 text-sm text-zinc-400">By {author}</p>}
      {children}

      {starters.length > 0 && (
        <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {starters.slice(0, 4).map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onStarter(starter)}
              className="gpt-starter frost cursor-pointer rounded-2xl px-5 py-3.5 text-left text-sm leading-snug text-zinc-200"
            >
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
