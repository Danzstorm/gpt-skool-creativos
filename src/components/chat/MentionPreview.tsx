"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  MENTION_HOVER_PREVIEW_PX,
  type MentionCandidate,
} from "@/lib/attachment-mentions";
import AttachmentStill from "./AttachmentStill";

const noSubscribe = () => () => {};

interface Props {
  candidate: MentionCandidate;
  anchor: DOMRect;
}

function previewPosition(anchor: DOMRect) {
  const size = MENTION_HOVER_PREVIEW_PX;
  const gap = 10;
  let top = anchor.top - size - gap;
  if (top < 8) top = anchor.bottom + gap;
  const left = Math.max(
    8,
    Math.min(anchor.left + anchor.width / 2 - size / 2, window.innerWidth - size - 8)
  );
  return { top, left };
}

/**
 * Foto Higgsfield: ~300px, portal al body para no recortarse con .frost.
 * El "ya monté" va por useSyncExternalStore para no setear estado en un effect
 * (eslint react-hooks/set-state-in-effect), que bloqueaba el deploy.
 */
export default function MentionPreview({ candidate, anchor }: Props) {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return null;

  const pos = previewPosition(anchor);

  return createPortal(
    <div
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
