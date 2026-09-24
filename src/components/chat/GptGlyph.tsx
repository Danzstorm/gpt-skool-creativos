import Image from "next/image";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { foldGptText, getGptVisual } from "@/lib/gpt-visual";
import ProtoIcon, { protoIconForCraft, type ProtoIconName } from "./ProtoIcon";

type GlyphSize = "xs" | "sm" | "lg" | "xl" | "hero";

const PROTOTYPE_ICON_BY_GPT: Record<string, ProtoIconName> = {
  "iphone look": "phone",
  "kling director": "play",
  "luxury prompt": "diamond",
  "ugc models": "users",
};

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
  const iconName = PROTOTYPE_ICON_BY_GPT[foldGptText(gpt?.name ?? "").trim()] ?? protoIconForCraft(craft);
  const imageSizes = sizePx || { xs: "20px", sm: "24px", lg: "32px", xl: "48px", hero: "132px" }[size];

  // Nav del sidebar = trazo fino del prototipo (ProtoIcon). Las fotos
  // `icon_url` siguen en tarjetas/hero; en la lista engordan el glyph.
  if (gpt?.icon_url && variant !== "nav") {
    return (
      <span
        className={cn("symbol", className)}
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
