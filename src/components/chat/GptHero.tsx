import type { CSSProperties, ReactNode } from "react";
import type { Gpt } from "@/lib/types";
import { conversationStartersOf, getGptVisual } from "@/lib/gpt-visual";
import GptGlyph from "./GptGlyph";

interface Props {
  gpt: Gpt;
  onStarter: (text: string) => void;
  children?: ReactNode;
}

// Empty-state del GPT activo: esfera de vidrio del oficio, mismo fluir que Creativos.
export default function GptHero({ gpt, onStarter, children }: Props) {
  const { label, accentHex } = getGptVisual(gpt.category, gpt.name, gpt.description);
  const starters = conversationStartersOf(gpt.conversation_starters);
  const description = gpt.description?.trim() || "";
  const author = gpt.author?.trim() || "";

  return (
    <div
      className="gpt-hero relative flex min-h-full w-full max-w-2xl mx-auto flex-col items-center justify-center px-1 py-10 text-center"
      style={{ "--craft": accentHex } as CSSProperties}
    >
      <GptGlyph gpt={gpt} size="hero" className="mb-8" />

      {label && <p className="mb-3 text-[13px] tracking-wide text-zinc-400">{label}</p>}
      <h3 className="font-display italic text-2xl font-semibold tracking-tight text-zinc-100 md:text-3xl">
        {gpt.name}
      </h3>
      {description && (
        <p className="mt-3 max-w-md text-base leading-normal text-zinc-300">{description}</p>
      )}
      {author && <p className="mt-2 text-sm leading-normal text-zinc-500">By {author}</p>}
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
