import type { CSSProperties, PointerEvent } from "react";
import type { Gpt } from "@/lib/types";
import GptGlyph from "@/components/chat/GptGlyph";
import HaloRim from "@/components/chat/HaloRim";
import ProtoIcon from "@/components/chat/ProtoIcon";
import { getGptVisual } from "@/lib/gpt-visual";

interface Props {
  gpt: Gpt;
  onSelect: (id: string) => void;
  onPreview?: (accent: string | null) => void;
  style?: CSSProperties;
}

export default function GptCard({ gpt, onSelect, onPreview, style }: Props) {
  const description = gpt.description?.trim() || "";
  const { accentHex } = getGptVisual(gpt.category, gpt.name, gpt.description);

  function trackPointer(e: PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty("--mx", `${x}%`);
    e.currentTarget.style.setProperty("--my", `${y}%`);
    const dx = x / 100 - 0.5;
    const dy = y / 100 - 0.5;
    const dist = Math.min(1, Math.hypot(dx, dy) * 1.6);
    e.currentTarget.style.setProperty("--edge-strength", String(1 - dist * 0.35));
  }

  return (
    <button
      type="button"
      className="tool"
      data-tool={gpt.id}
      onClick={() => onSelect(gpt.id)}
      onMouseEnter={() => onPreview?.(accentHex)}
      onMouseLeave={() => onPreview?.(null)}
      onFocus={() => onPreview?.(accentHex)}
      onBlur={() => onPreview?.(null)}
      onPointerMove={trackPointer}
      style={style}
      aria-label={`Abrir ${gpt.name}`}
    >
      <HaloRim id={gpt.id} />
      <GptGlyph gpt={gpt} size="sm" />
      <span className="arrow">
        <ProtoIcon name="arrow" />
      </span>
      <h3>{gpt.name}</h3>
      <p title={description || undefined}>{description || "\u00a0"}</p>
    </button>
  );
}
