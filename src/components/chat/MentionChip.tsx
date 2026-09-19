"use client";

import type { MentionCandidate } from "@/lib/attachment-mentions";
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
  return (
    <span
      data-mention={token}
      contentEditable={false}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "mention-chip",
        candidate?.previewUrl && "mention-chip--has-preview"
      )}
      onMouseEnter={(e) => onPreview?.(e.currentTarget, token)}
      onFocus={(e) => onPreview?.(e.currentTarget, token)}
      onMouseLeave={onPreviewEnd}
      onBlur={onPreviewEnd}
    >
      {token}
    </span>
  );
}
