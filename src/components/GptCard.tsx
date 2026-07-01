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
      className="group block bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-5 transition-all hover:shadow-lg hover:shadow-purple-500/10"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-xl flex-shrink-0">
          {gpt.icon_url ? (
            <img src={gpt.icon_url} alt="" className="w-8 h-8 rounded-lg" />
          ) : (
            "✦"
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold group-hover:text-purple-300 transition truncate">
            {gpt.name}
          </h3>
          {gpt.category && (
            <span className="text-xs text-purple-400 font-medium">
              {gpt.category}
            </span>
          )}
          {gpt.description && (
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">
              {gpt.description}
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <MessageSquare size={11} />
              Chat
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <FileText size={11} />
              Archivos
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <ImageIcon size={11} />
              Imágenes
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Code size={11} />
              Código
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
