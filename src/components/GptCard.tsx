import Link from "next/link";
import type { Gpt } from "@/lib/types";
import GptGlyph from "@/components/chat/GptGlyph";
import { getGptVisual } from "@/lib/gpt-visual";

interface Props {
  gpt: Gpt;
}

export default function GptCard({ gpt }: Props) {
  const { accentClasses } = getGptVisual(gpt.category);

  return (
    <Link
      href={`/chat?gpt=${gpt.id}`}
      className="group relative block rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/70"
    >
      <div className="flex items-start gap-4">
        <GptGlyph
          gpt={gpt}
          className="h-12 w-12 rounded-xl"
          sizePx="48px"
          textClassName="text-xl"
        />

        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-lg font-medium text-zinc-50 transition group-hover:text-white">
            {gpt.name}
          </h3>
          {gpt.category && (
            <span
              className={`inline-block mt-0.5 rounded-full border bg-gradient-to-br px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${accentClasses}`}
            >
              {gpt.category}
            </span>
          )}
          {gpt.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-400">
              {gpt.description}
            </p>
          )}
          {gpt.author && <p className="mt-1.5 text-xs text-zinc-600">By {gpt.author}</p>}
        </div>
      </div>
    </Link>
  );
}
