"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MentionCandidate } from "@/lib/attachment-mentions";
import AttachmentStill from "./AttachmentStill";

interface Props {
  candidate: MentionCandidate;
  anchor: DOMRect;
}

const PREVIEW_WIDTH = 280;

/**
 * Foto Higgsfield: ~280px, esquinas redondas, anclada al token.
 * Sin caption ni chrome extra — el token ya está en la línea.
 */
export default function MentionPreview({ candidate, anchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const height = el?.offsetHeight ?? PREVIEW_WIDTH;
    const gap = 8;
    let top = anchor.top - height - gap;
    if (top < 8) top = anchor.bottom + gap;
    let left = anchor.left + anchor.width / 2 - PREVIEW_WIDTH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - PREVIEW_WIDTH - 8));
    setPos({ top, left });
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="mention-preview pointer-events-none fixed z-50 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50"
      style={{ top: pos.top, left: pos.left, width: PREVIEW_WIDTH }}
    >
      <div className="aspect-square w-full">
        <AttachmentStill
          file={candidate}
          className="aspect-square h-full w-full object-cover"
          iconSize={32}
        />
      </div>
    </div>
  );
}
