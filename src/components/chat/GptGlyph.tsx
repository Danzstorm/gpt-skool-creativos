import Image from "next/image";
import type { CSSProperties } from "react";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";
import GptMark from "./GptMark";

const SIZES = {
  xs: "xs",
  sm: "sm",
  lg: "lg",
  xl: "xl",
  hero: "hero",
} as const;

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category"> & { description?: string | null };
  size?: keyof typeof SIZES;
  className?: string;
  sizePx?: string;
  textClassName?: string;
}

// Marca canónica: disco de gema de oficio + silueta, misma familia que el Orb.
export default function GptGlyph({ gpt, size = "sm", className, sizePx }: Props) {
  const { markKind, accentHex } = getGptVisual(gpt?.category, gpt?.name, gpt?.description);
  const letter = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "G";
  const imageSizes = sizePx || { xs: "20px", sm: "24px", lg: "32px", xl: "48px", hero: "132px" }[size];

  return (
    <span
      className={cn("gpt-glyph inline-flex flex-shrink-0", className)}
      style={{ "--craft": accentHex } as CSSProperties}
    >
      <GptMark kind={markKind} letter={letter} size={size}>
        {gpt?.icon_url ? (
          <Image src={gpt.icon_url} alt="" fill sizes={imageSizes} className="object-cover" />
        ) : undefined}
      </GptMark>
    </span>
  );
}
