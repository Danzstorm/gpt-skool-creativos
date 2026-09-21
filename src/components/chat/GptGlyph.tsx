import Image from "next/image";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";
import ProtoIcon, { protoIconForCraft } from "./ProtoIcon";

type GlyphSize = "xs" | "sm" | "lg" | "xl" | "hero";

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category"> & { description?: string | null };
  size?: GlyphSize;
  className?: string;
  sizePx?: string;
  textClassName?: string;
  /** `nav` = lockup de lista; el resto es el símbolo de tarjeta/hero. */
  variant?: "mark" | "nav";
}

export default function GptGlyph({ gpt, size = "sm", className, sizePx, variant = "mark" }: Props) {
  const { craft } = getGptVisual(gpt?.category, gpt?.name, gpt?.description);
  const iconName = protoIconForCraft(craft);
  const imageSizes = sizePx || { xs: "20px", sm: "24px", lg: "32px", xl: "48px", hero: "132px" }[size];

  if (gpt?.icon_url) {
    return (
      <span
        className={cn(
          variant === "nav" ? "gpt-nav-mark" : "symbol",
          variant === "nav" && `gpt-nav-mark-${size}`,
          className
        )}
        aria-hidden
        style={{ position: "relative", display: "inline-flex", width: imageSizes, height: imageSizes }}
      >
        <Image src={gpt.icon_url} alt="" fill sizes={imageSizes} className="object-cover rounded-[6px]" />
      </span>
    );
  }

  return (
    <span className={cn(variant === "nav" ? undefined : "symbol", className)} aria-hidden>
      <ProtoIcon name={iconName} />
    </span>
  );
}
