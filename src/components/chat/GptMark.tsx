import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { GptMarkKind } from "@/lib/gpt-visual";
import GptEmblem from "./GptEmblem";

const SIZES = {
  xs: 20,
  sm: 24,
  lg: 32,
  xl: 48,
  hero: 132,
} as const;

interface Props {
  kind: GptMarkKind;
  letter?: string;
  size?: keyof typeof SIZES;
  className?: string;
  children?: ReactNode;
}

// Disco de gema de oficio: núcleo de color + silueta bold. El vidrio
// (halo, film, highlight) envuelve; el emblema no se esconde debajo.
export default function GptMark({ kind, letter = "G", size = "xl", className, children }: Props) {
  const uid = useId().replace(/:/g, "");
  const px = SIZES[size];

  return (
    <div
      aria-hidden="true"
      className={cn("gpt-mark relative shrink-0", `gpt-mark-${size}`, className)}
      style={{ width: px, height: px }}
    >
      <div className="gpt-mark-halo gpt-mark-breathe" />
      <div className="gpt-mark-sphere">
        <div className="gpt-mark-atmosphere" />
        <div className="gpt-mark-caustic gpt-mark-spin" />
        <span className="gpt-mark-emblem">
          {children ? (
            <span className="relative block h-full w-full overflow-hidden">{children}</span>
          ) : (
            <GptEmblem kind={kind} uid={uid} letter={letter} />
          )}
        </span>
        <div className="gpt-mark-film" />
        <div className="gpt-mark-highlight gpt-mark-shimmer" />
        <div className="gpt-mark-shade" />
        <div className="gpt-mark-rim" />
      </div>
    </div>
  );
}
