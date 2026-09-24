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
      className={[
        "tool group relative isolate overflow-visible text-left backdrop-blur-[12px]",
        "[--mx:50%] [--my:25%] [transform:translateY(0)_scale(1)]",
        "![transition:transform_.65s_cubic-bezier(.4,0,.2,1),background-color_.45s_ease,border-color_.45s_ease,box-shadow_.65s_cubic-bezier(.4,0,.2,1)]",
        "animate-[reveal_.65s_both] hover:[transform:translateY(-2px)_scale(1.02)]",
        "motion-reduce:!transform-none motion-reduce:!transition-none",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
        "before:bg-[linear-gradient(135deg,#ffb52512_0%,#ff643615_22%,#f7257016_48%,#d619df12_72%,#6559ef16_100%)]",
        "before:opacity-0 before:transition-opacity before:duration-500 before:ease-[ease]",
        "hover:before:opacity-100 focus-visible:before:opacity-100",
        "!min-h-[142px] !rounded-[12px] !border !border-[#ffffff10]",
        "!bg-[#101012] !bg-[linear-gradient(135deg,#ffffff03,transparent)]",
        "!px-[20px] !py-[21px] !shadow-[inset_0_1px_0_#ffffff05]",
        "[body.light-mode_&]:!bg-white [body.light-mode_&]:![background-image:none]",
        "[body.light-mode_&]:!text-[#292930] [body.light-mode_&]:!border-[#00000015]",
        "[body.light-mode_&]:!shadow-[0_5px_20px_#00000005]",
        "max-[900px]:!px-[15px] max-[900px]:!py-[18px]",
        "max-[650px]:![backdrop-filter:none] max-[650px]:!min-h-[150px]",
        "max-[650px]:!px-[12px] max-[650px]:!py-[16px]",
      ].join(" ")}
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
      <HaloRim id={gpt.id} card />
      <GptGlyph gpt={gpt} size="sm" className="!mb-[19px] block h-[20px] text-[#bcbcbc] [transition:color_.3s_ease,filter_.3s_ease,transform_.3s_ease] group-hover:text-[#ebdfe8] group-hover:[transform:translateY(-1px)] motion-reduce:group-hover:transform-none [&_svg]:h-[21px] [&_svg]:w-[21px] [&_svg]:!stroke-[1.4px]" />
      <span className="arrow absolute right-[18px] top-[22px] block text-[#747474] [transition:transform_.3s_ease,color_.3s_ease] group-hover:[transform:translateX(3px)] group-hover:text-[#dac2e9] motion-reduce:group-hover:transform-none max-[650px]:right-[10px] max-[650px]:top-[17px] [&_svg]:h-[19px] [&_svg]:w-[15px] [&_svg]:!stroke-[1.4px]">
        <ProtoIcon name="arrow" />
      </span>
      <h3 className="!mb-[8px] !mt-0 !font-normal !text-[#e8e8e8] tracking-[.1px] [body.light-mode_&]:!text-[#45454e]">{gpt.name}</h3>
      <p className="!m-0 line-clamp-2 !leading-[1.5] !text-[#a0a0a0]" title={description || undefined}>{description || "\u00a0"}</p>
    </button>
  );
}
