"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Paperclip, Video } from "lucide-react";
import type { MentionCandidate } from "@/lib/attachment-mentions";

interface Props {
  candidate: MentionCandidate;
  anchor: DOMRect;
}

const PREVIEW_WIDTH = 240;

/**
 * Popover Higgsfield: foto grande + token. Sin "guardar como elemento":
 * acá el archivo ya es un adjunto del hilo, no un elemento de librería.
 */
export default function MentionPreview({ candidate, anchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const height = el?.offsetHeight ?? 280;
    const gap = 10;
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
      {candidate.kind === "image" && candidate.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.previewUrl}
          alt={candidate.token}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-zinc-900">
          {candidate.kind === "video" ? (
            <Video size={32} className="text-zinc-500" />
          ) : (
            <Paperclip size={32} className="text-zinc-500" />
          )}
        </div>
      )}
      <p className="px-3 py-2 text-sm text-zinc-100">{candidate.token}</p>
    </div>
  );
}
