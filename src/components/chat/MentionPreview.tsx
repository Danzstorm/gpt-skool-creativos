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
  const max = MENTION_HOVER_PREVIEW_PX;
  const gap = 10;
  const placeBelow = anchor.top < max + gap + 8;
  const centerX = anchor.left + anchor.width / 2;
  const half = max / 2;
  const left = Math.max(8 + half, Math.min(centerX, window.innerWidth - 8 - half));
  return {
    top: placeBelow ? anchor.bottom + gap : anchor.top - gap,
    left,
    transform: placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
  };
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
      style={{ top: pos.top, left: pos.left, transform: pos.transform }}
    >
      <div className="mention-preview-still">
        <AttachmentStill
          file={candidate}
          className="max-h-full max-w-full object-contain"
          iconSize={36}
        />
      </div>
    </div>,
    document.body
  );
}
