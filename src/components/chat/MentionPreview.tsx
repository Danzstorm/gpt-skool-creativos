"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MENTION_HOVER_PREVIEW_PX,
  type MentionCandidate,
} from "@/lib/attachment-mentions";
import AttachmentStill from "./AttachmentStill";

interface Props {
  candidate: MentionCandidate;
  anchor: DOMRect;
}

/**
 * Foto Higgsfield: ~300px, portal al body para no recortarse con .frost.
 */
export default function MentionPreview({ candidate, anchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const height = el?.offsetHeight ?? MENTION_HOVER_PREVIEW_PX;
    const gap = 10;
    let top = anchor.top - height - gap;
    if (top < 8) top = anchor.bottom + gap;
    let left = anchor.left + anchor.width / 2 - MENTION_HOVER_PREVIEW_PX / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - MENTION_HOVER_PREVIEW_PX - 8));
    setPos({ top, left });
  }, [anchor]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="mention-preview pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="mention-preview-still">
        <AttachmentStill
          file={candidate}
          className="h-full w-full object-cover"
          iconSize={36}
        />
      </div>
    </div>,
    document.body
  );
}
