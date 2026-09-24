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
      className="tool !min-h-[142px] !rounded-[12px] !border !border-[#ffffff10] !bg-[#101012] !bg-[linear-gradient(135deg,#ffffff03,transparent)] !px-[20px] !py-[21px] !shadow-[inset_0_1px_0_#ffffff05] max-[900px]:!px-[15px] max-[900px]:!py-[18px] max-[650px]:!min-h-[150px] max-[650px]:!px-[12px] max-[650px]:!py-[16px]"
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
      <GptGlyph gpt={gpt} size="sm" className="!mb-[19px]" />
      <span className="arrow">
        <ProtoIcon name="arrow" />
      </span>
      <h3 className="!mb-[8px] !mt-0 !font-normal">{gpt.name}</h3>
      <p className="!m-0 line-clamp-2 !leading-[1.5]" title={description || undefined}>{description || "\u00a0"}</p>
    </button>
  );
}
