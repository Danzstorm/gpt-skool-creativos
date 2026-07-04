import Link from "next/link";
import type { Gpt } from "@/lib/types";
import GptMark from "@/components/GptMark";

interface Props {
  gpt: Gpt;
}

export default function GptCard({ gpt }: Props) {
  return (
    <Link
      href={`/chat?gpt=${gpt.id}`}
      className="group relative block rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-700 hover:bg-stone-900/70 hover:shadow-[0_10px_40px_-16px_rgba(139,92,246,0.3)]"
    >
      <div className="flex items-start gap-4">
        <GptMark
          name={gpt.name}
          iconUrl={gpt.icon_url}
          category={gpt.category}
          className="h-12 w-12 rounded-xl"
          sizePx={48}
          initialClassName="text-xl"
        />

        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-lg font-medium text-stone-50 transition group-hover:text-white">
            {gpt.name}
          </h3>
          {gpt.category && (
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-violet-400/80">
              {gpt.category}
            </span>
          )}
          {gpt.description && (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-stone-400">
              {gpt.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
