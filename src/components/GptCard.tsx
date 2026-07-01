import Link from "next/link";
import type { Gpt } from "@/lib/types";
import { MessageSquare, FileText, ImageIcon, Code } from "lucide-react";

interface Props {
  gpt: Gpt;
}

export default function GptCard({ gpt }: Props) {
  return (
    <Link
      href={`/chat/${gpt.id}`}
      className="group relative block bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-900 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] hover:shadow-[0_8px_30px_-12px_rgba(139,92,246,0.25)]"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20 flex items-center justify-center text-xl flex-shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
          {gpt.icon_url ? (
            <img src={gpt.icon_url} alt="" className="w-8 h-8 rounded-lg" />
          ) : (
            "✦"
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-zinc-100 font-semibold group-hover:text-white transition truncate">
            {gpt.name}
          </h3>
          {gpt.category && (
            <span className="text-xs text-violet-400/90 font-medium">
              {gpt.category}
            </span>
          )}
          {gpt.description && (
            <p className="text-zinc-400 text-sm mt-1 line-clamp-2 leading-relaxed">
              {gpt.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {[
              { icon: MessageSquare, label: "Chat" },
              { icon: FileText, label: "Archivos" },
              { icon: ImageIcon, label: "Imágenes" },
              { icon: Code, label: "Código" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-800/50 border border-zinc-800 rounded-full px-2 py-0.5"
              >
                <Icon size={10} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
