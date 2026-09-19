import { useId } from "react";
import { cn } from "@/lib/utils";
import type { GptMarkKind } from "@/lib/gpt-visual";
import GptEmblem from "./GptEmblem";

const SIZES = {
  md: 104,
  xl: 176,
} as const;

interface Props {
  kind: GptMarkKind;
  letter?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

// Misma familia que el Orb de Creativos: esfera de vidrio, halo, caústico,
// highlight y sombra interna. El núcleo es un emblema de oficio, no Lucide.
export default function GptMark({ kind, letter = "G", size = "xl", className }: Props) {
  const uid = useId().replace(/:/g, "");
  const px = SIZES[size];

  return (
    <div
      aria-hidden="true"
      className={cn("gpt-mark relative shrink-0", `gpt-mark-${size}`, className)}
      style={{ width: px, height: px }}
    >
      <div className="gpt-mark-halo gpt-mark-breathe" />
      <div className="gpt-mark-sphere gpt-mark-tilt">
        <div className="gpt-mark-atmosphere" />
        <div className="gpt-mark-caustic gpt-mark-spin" />
        <span className="gpt-mark-emblem">
          <GptEmblem kind={kind} uid={uid} letter={letter} />
        </span>
        <div className="gpt-mark-film" />
        <div className="gpt-mark-highlight gpt-mark-shimmer" />
        <div className="gpt-mark-shade" />
        <div className="gpt-mark-rim" />
      </div>
    </div>
  );
}
