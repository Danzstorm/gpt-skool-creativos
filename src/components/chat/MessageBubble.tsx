import { memo } from "react";
import { Copy, Check, RotateCcw, Pencil } from "lucide-react";
import type { Gpt, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";
import GptGlyph from "./GptGlyph";

interface Props {
  message: Message;
  index: number;
  activeGpt?: Gpt;
  isLast: boolean;
  streaming: boolean;
  canRegenerate: boolean;
  canEdit: boolean;
  isCopied: boolean;
  onCopy: (index: number, content: string) => void;
  onRegenerate: () => void;
  onEdit: (index: number) => void;
}

// Callbacks son referencias estables del padre (useCallback) + `index` primitivo:
// así memo() evita re-renderizar los bubbles que no cambiaron durante el streaming.
function MessageBubble({
  message: msg,
  index,
  activeGpt,
  isLast,
  streaming,
  canRegenerate,
  canEdit,
  isCopied,
  onCopy,
  onRegenerate,
  onEdit,
}: Props) {
  return (
    <div className={cn("group flex", msg.role === "user" ? "justify-end" : "justify-start")}>
      {msg.role === "assistant" && (
        <div className="mr-2 mt-0.5">
          <GptGlyph gpt={activeGpt} />
        </div>
      )}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            msg.role === "user"
              ? "bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-br-sm shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]"
              : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm border border-zinc-700/50"
          )}
        >
          {msg.files && msg.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {msg.files.map((f, fi) =>
                f.type === "image" && f.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={fi}
                    src={f.previewUrl}
                    alt={f.name}
                    className="w-24 h-24 object-cover rounded-lg border border-white/20"
                  />
                ) : (
                  <span key={fi} className="text-xs bg-white/10 rounded-lg px-2 py-1">
                    📎 {f.name}
                  </span>
                )
              )}
            </div>
          )}
          {msg.content ? (
            msg.role === "assistant" ? (
              <div className="flex items-end">
                <MessageContent content={msg.content} />
                {streaming && (
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
                )}
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            )
          ) : (
            msg.role === "assistant" && (
              <span className="inline-flex gap-1">
                <span className="animate-bounce delay-0">·</span>
                <span className="animate-bounce delay-100">·</span>
                <span className="animate-bounce delay-200">·</span>
              </span>
            )
          )}
        </div>

        {msg.content && !streaming && (
          <div
            className={cn(
              "flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <button
              onClick={() => onCopy(index, msg.content)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
              title="Copiar"
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {msg.role === "assistant" && isLast && canRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                title="Regenerar"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {msg.role === "user" && canEdit && (
              <button
                onClick={() => onEdit(index)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                title="Editar"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
