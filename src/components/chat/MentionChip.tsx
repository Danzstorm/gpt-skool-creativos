"use client";

import { mentionChipLabel, mentionTokenLabel, type MentionCandidate } from "@/lib/attachment-mentions";
import { cn } from "@/lib/utils";

interface Props {
  token: string;
  candidate?: MentionCandidate;
  interactive?: boolean;
  onPreview?: (el: HTMLElement, token: string) => void;
  onPreviewEnd?: () => void;
}

export default function MentionChip({
  token,
  candidate,
  interactive = false,
  onPreview,
  onPreviewEnd,
}: Props) {
  const still = candidate?.previewUrl;

  return (
    <span
      data-mention={token}
      data-preview={still ?? ""}
      title={mentionTokenLabel(token)}
      contentEditable={false}
      tabIndex={interactive ? 0 : undefined}
      className={cn("mention-chip", still && "mention-chip--has-preview")}
      onMouseEnter={(e) => onPreview?.(e.currentTarget, token)}
      onFocus={(e) => onPreview?.(e.currentTarget, token)}
      onMouseLeave={onPreviewEnd}
      onBlur={onPreviewEnd}
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still} alt="" className="mention-chip-still" draggable={false} />
      ) : (
        <span className="mention-chip-still mention-chip-still--empty" />
      )}
      <span className="mention-chip-label">
        <span className="mention-chip-at">@</span>
        {mentionChipLabel(token)}
      </span>
    </span>
  );
}
