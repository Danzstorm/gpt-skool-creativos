import { memo } from "react";
import type { Gpt, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";
import { imageLabel, type ThreadNumbers } from "@/lib/attachment-labels";
import type { MentionCandidate } from "@/lib/attachment-mentions";
import MentionedText from "./MentionedText";
import AttachmentStill from "./AttachmentStill";
import AudioPreview from "./AudioPreview";

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
          <div key={f.openai_file_id || fi} className="attachment attach-tile">
            <AudioPreview src={f.mediaUrl || f.previewUrl} name={f.name} />
          </div>
        ) : visual ? (
          <div key={f.openai_file_id || fi} className="attach-tile">
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
          <span key={f.openai_file_id || fi} className="prompt-note">
            {f.name}
          </span>
        );
      })}
    </div>
  );

  if (!isUser) {
    if (streaming && !msg.content) {
      return <div className="message assistant">{thinkingSlot ?? <span>…</span>}</div>;
    }
    return (
      <div className={cn("message assistant prompt-card", !streaming && "new-response")}>
        {files}
        {msg.content ? (
          <>
            <div className="prompt-header">
              <span className="prompt-label">PROMPT</span>
              <button
                type="button"
                className={cn("prompt-copy", isCopied && "copy-confirmed")}
                onClick={() => onCopy(index, msg.content)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M4 16V6a2 2 0 0 1 2-2h10" />
                </svg>
                {isCopied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="prompt-body">
              <MessageContent content={msg.content} />
              {streaming && (
                <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 mb-1 rounded-sm animate-pulse" />
              )}
            </div>
          </>
        ) : (
          msg.error && <p className="prompt-body" style={{ color: "#f88" }}>{msg.error}</p>
        )}
        {msg.content && msg.error && (
          <p className="prompt-note" style={{ color: "#f88" }}>{msg.error}</p>
        )}
        {!streaming && isLast && canRegenerate && (
          <div className="prompt-note">
            <button type="button" className="prompt-copy" onClick={onRegenerate}>
              Regenerar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="message user">
      {files}
      <MentionedText text={msg.content} mentions={mentions} />
      {!streaming && canEdit && (
        <div className="prompt-note">
          <button type="button" className="prompt-copy" onClick={() => onEdit(index)}>
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
