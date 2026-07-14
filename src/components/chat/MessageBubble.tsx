import { memo } from "react";
import { Copy, Check, RotateCcw, Pencil, Paperclip } from "lucide-react";
import type { Gpt, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";

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

// Patrón ChatGPT: el usuario va en una burbuja alineada a la derecha; el
// asistente NO lleva burbuja ni avatar por mensaje — su contenido fluye como
// texto en la columna (el único "recuadro" es el bloque de código que arma
// MessageContent). Así se gana altura y se quita el ruido del glyph repetido.
function MessageBubble({
  message: msg,
  index,
  isLast,
  streaming,
  canRegenerate,
  canEdit,
  isCopied,
  onCopy,
  onRegenerate,
  onEdit,
}: Props) {
  const isUser = msg.role === "user";

  const files = msg.files && msg.files.length > 0 && (
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
          <span key={fi} className="inline-flex items-center gap-1 text-xs bg-zinc-700/40 rounded-lg px-2 py-1">
            <Paperclip size={12} className="flex-shrink-0" />
            {f.name}
          </span>
        )
      )}
    </div>
  );

  const actions = msg.content && !streaming && (
    <div
      className={cn(
        // En desktop se ocultan con `hidden` (no `opacity-0`) para NO ocupar
        // altura entre mensajes; aparecen al hover. En móvil siempre visibles.
        "flex md:hidden md:group-hover:flex gap-0.5",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <button
        onClick={() => onCopy(index, msg.content)}
        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
        title="Copiar"
      >
        {isCopied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {!isUser && isLast && canRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
          title="Regenerar"
        >
          <RotateCcw size={14} />
        </button>
      )}
      {isUser && canEdit && (
        <button
          onClick={() => onEdit(index)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );

  // Asistente: ancho completo de la columna, sin burbuja ni avatar.
  if (!isUser) {
    return (
      <div className="group">
        {files}
        {msg.content ? (
          <div className="flex items-end text-zinc-100">
            <MessageContent content={msg.content} />
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
            )}
          </div>
        ) : (
          <span className="inline-flex gap-1 text-zinc-400">
            <span className="animate-bounce delay-0">·</span>
            <span className="animate-bounce delay-100">·</span>
            <span className="animate-bounce delay-200">·</span>
          </span>
        )}
        <div className="mt-1">{actions}</div>
      </div>
    );
  }

  // Usuario: burbuja compacta alineada a la derecha.
  return (
    <div className="group flex justify-end">
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div className="rounded-2xl rounded-br-sm bg-zinc-800 text-ink px-4 py-2.5">
          {files}
          <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
        {actions}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
