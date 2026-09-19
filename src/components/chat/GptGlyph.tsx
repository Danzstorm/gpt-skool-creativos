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
  /** Solo sidebar: icono plano tipo lista, rojo Creativos. */
  variant?: "mark" | "nav";
}

const NAV_ICON = { xs: 14, sm: 15, lg: 16, xl: 20, hero: 22 } as const;

// Marca canónica: disco de gema. `nav` es el lockup de la barra (sin 3D).
export default function GptGlyph({ gpt, size = "sm", className, sizePx, variant = "mark" }: Props) {
  const { markKind, accentHex, Icon } = getGptVisual(gpt?.category, gpt?.name, gpt?.description);
  const letter = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "G";
  const imageSizes = sizePx || { xs: "20px", sm: "24px", lg: "32px", xl: "48px", hero: "132px" }[size];

  if (variant === "nav") {
    return (
      <span
        className={cn("gpt-nav-mark", `gpt-nav-mark-${size}`, className)}
        aria-hidden
      >
        {gpt?.icon_url ? (
          <Image src={gpt.icon_url} alt="" fill sizes={imageSizes} className="object-cover" />
        ) : (
          <Icon size={NAV_ICON[size]} strokeWidth={1.75} />
        )}
      </span>
    );
  }

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
