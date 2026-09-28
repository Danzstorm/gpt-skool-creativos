import { memo } from "react";
import type { Gpt, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";
import { imageLabel, type ThreadNumbers } from "@/lib/attachment-labels";
import type { MentionCandidate } from "@/lib/attachment-mentions";
import { unwrapPromptFence } from "@/lib/unwrap-prompt";
import MentionedText from "./MentionedText";
import AttachmentStill from "./AttachmentStill";
import AudioPreview, { attachTileClass } from "./AudioPreview";

// Botón Copiar/Regenerar/Editar: degradado ::before que destella al copiar.
const copyClass =
  "prompt-copy active:scale-[.97] before:pointer-events-none before:absolute before:inset-0 before:z-[-1] before:rounded-[inherit] before:bg-[linear-gradient(115deg,#ffbd16,#ff682f_22%,#ff165e_46%,#ee0de4_73%,#7753ff)] before:opacity-0 before:content-['']";
// `!`: button{color:inherit} de legacy.
const copyConfirmedClass =
  "copy-confirmed !text-[#f4f4f6] animate-[copy-soft-press_1.5s_cubic-bezier(.22,1,.36,1)] before:animate-[copy-color_1.5s_cubic-bezier(.4,0,.2,1)] motion-reduce:animate-none motion-reduce:before:animate-none";

// Nota bajo el prompt o el mensaje (Martin .prompt-note).
const noteClass =
  "prompt-note px-6 pb-[17px] text-[11px] text-[#777780] max-[650px]:px-[18px] max-[650px]:pb-4";

interface Props {
  message: Message;
  numbers: ThreadNumbers;
  mentions: MentionCandidate[];
  index: number;
  activeGpt?: Gpt;
  isLast: boolean;
  streaming: boolean;
  thinkingSlot?: React.ReactNode;
  canRegenerate: boolean;
  canEdit: boolean;
  isCopied: boolean;
  className?: string;
  onCopy: (index: number, content: string) => void;
  onRegenerate: () => void;
  onEdit: (index: number) => void;
}

function MessageBubble({
  message: msg,
  numbers,
  mentions,
  index,
  isLast,
  streaming,
  thinkingSlot,
  canRegenerate,
  canEdit,
  isCopied,
  className,
  onCopy,
  onRegenerate,
  onEdit,
}: Props) {
  const isUser = msg.role === "user";

  const files = msg.files && msg.files.length > 0 && (
    <div className="sent-images">
      {msg.files.map((f, fi) => {
        const position = numbers.images.get(f.openai_file_id) ?? null;
        const visual = f.type === "image" || f.type === "video";
        return f.type === "audio" ? (
          <div key={f.openai_file_id || fi} className={cn("attachment", attachTileClass)}>
            <AudioPreview src={f.mediaUrl || f.previewUrl} name={f.name} />
          </div>
        ) : visual ? (
          <div key={f.openai_file_id || fi} className={attachTileClass}>
            <AttachmentStill
              file={{
                kind: f.type,
                previewUrl: f.previewUrl,
                mediaUrl: f.mediaUrl,
                durationSeconds: f.durationSeconds,
              }}
              loop={f.type === "video"}
              className="h-16 w-16 object-cover"
            />
            <span className="sr-only">
              {position !== null ? imageLabel(position) : f.name}
            </span>
          </div>
        ) : (
          <span key={f.openai_file_id || fi} className={noteClass}>
            {f.name}
          </span>
        );
      })}
    </div>
  );

  if (!isUser) {
    if (streaming && !msg.content) {
      return (
        <div className={cn("message assistant shrink-0", className)}>
          {thinkingSlot ?? <span>…</span>}
        </div>
      );
    }
    const promptText = unwrapPromptFence(msg.content);
    return (
      <div
        className={cn(
          "message assistant prompt-card shrink-0 leading-[1.85]",
          // `!`: messages.css (legacy) pone animation:none en la tarjeta.
          !streaming && "new-response !animate-[wait-appear_.3s_ease-out] motion-reduce:!animate-none",
          className
        )}
      >
        {files}
        {promptText ? (
          <>
            <div className="prompt-header">
              <span className="prompt-label tracking-[1.4px] text-[#99999f]">PROMPT</span>
              <button
                type="button"
                className={cn(copyClass, isCopied && copyConfirmedClass)}
                onClick={() => onCopy(index, promptText)}
              >
                <svg viewBox="0 0 24 24" aria-hidden className="fill-none stroke-current">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M4 16V6a2 2 0 0 1 2-2h10" />
                </svg>
                {isCopied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="prompt-body">
              <MessageContent content={promptText} />
              {streaming && (
                <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
              )}
            </div>
          </>
        ) : (
          msg.error && <p className="prompt-body" style={{ color: "#f88" }}>{msg.error}</p>
        )}
        {msg.content && msg.error && (
          <p className={noteClass} style={{ color: "#f88" }}>{msg.error}</p>
        )}
        {!streaming && isLast && canRegenerate && (
          <div className={noteClass}>
            <button type="button" className={copyClass} onClick={onRegenerate}>
              Regenerar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("message user ml-auto w-fit max-w-[min(100%,32rem)] shrink-0 whitespace-pre-wrap", className)}>
      {files}
      <MentionedText text={msg.content} mentions={mentions} />
      {!streaming && canEdit && (
        <div className={noteClass}>
          <button type="button" className={copyClass} onClick={() => onEdit(index)}>
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
