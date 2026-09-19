import Image from "next/image";
import type { CSSProperties } from "react";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";

const SIZES = {
  xs: { box: "h-5 w-5 rounded-md", px: "20px", text: "text-[9px]", icon: 13 },
  sm: { box: "h-6 w-6 rounded-md", px: "24px", text: "text-[11px]", icon: 14 },
  lg: { box: "h-8 w-8 rounded-lg", px: "32px", text: "text-sm", icon: 16 },
  xl: { box: "h-11 w-11 rounded-xl", px: "44px", text: "text-lg", icon: 22 },
  hero: { box: "h-14 w-14 rounded-2xl", px: "56px", text: "text-xl", icon: 26 },
} as const;

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category"> & { description?: string | null };
  size?: keyof typeof SIZES;
  className?: string;
  sizePx?: string;
  textClassName?: string;
}

// Marca canónica: pastilla zinc + Lucide de trazo fino.
// El tinte suave del oficio vive en el símbolo, no en un badge esmaltado.
export default function GptGlyph({ gpt, size = "sm", className, sizePx, textClassName }: Props) {
  const preset = SIZES[size];
  const { craft, Icon, accentHex } = getGptVisual(gpt?.category, gpt?.name, gpt?.description);
  const initial = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "G";

  return (
    <span
      className={cn(
        "gpt-glyph relative flex flex-shrink-0 items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-900",
        preset.box,
        className
      )}
      style={{ "--craft": accentHex } as CSSProperties}
      aria-hidden
    >
      {gpt?.icon_url ? (
        <Image src={gpt.icon_url} alt="" fill sizes={sizePx || preset.px} className="object-cover" />
      ) : craft ? (
        <Icon size={preset.icon} strokeWidth={1.75} className="gpt-glyph-symbol" />
      ) : (
        <span
          className={cn(
            "font-medium leading-none text-zinc-400",
            textClassName || preset.text
          )}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
