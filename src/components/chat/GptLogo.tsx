import { useId, type CSSProperties } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { GPT_LOGO_PX, type GptMarkKind } from "@/lib/gpt-visual";
import GptEmblem from "./GptEmblem";

export const GPT_LOGO_SIZES = GPT_LOGO_PX;

interface Props {
  kind: GptMarkKind;
  letter?: string;
  size?: keyof typeof GPT_LOGO_SIZES;
  iconUrl?: string | null;
  className?: string;
  style?: CSSProperties;
}

// Badge de oficio para catálogo y sidebar: esmalte del espectro Creativos,
// no pastilla negra ni esfera oscura. El empty-state sigue en GptMark.
export default function GptLogo({
  kind,
  letter = "G",
  size = "md",
  iconUrl,
  className,
  style,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const px = GPT_LOGO_SIZES[size];
  const compact = size === "xs";

  return (
    <span
      aria-hidden="true"
      className={cn("gpt-logo relative shrink-0", `gpt-logo-${size}`, className)}
      style={{ width: px, height: px, ...style }}
    >
      <span className="gpt-logo-glow" />
      <span className="gpt-logo-plate">
        {iconUrl ? (
          <Image src={iconUrl} alt="" fill sizes={`${px}px`} className="object-cover" />
        ) : (
          <GptEmblem kind={kind} uid={uid} letter={letter} compact={compact} />
        )}
      </span>
    </span>
  );
}
