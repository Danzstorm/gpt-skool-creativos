import Image from "next/image";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";

export default function GptGlyph({ gpt, size = "sm" }: { gpt?: Gpt; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "w-8 h-8 rounded-lg" : "w-6 h-6 rounded-md";
  const px = size === "lg" ? "32px" : "24px";
  const { accentClasses } = getGptVisual(gpt?.category);
  const initial = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "•";
  return (
    <span
      className={cn(
        "relative flex items-center justify-center flex-shrink-0 bg-gradient-to-br border overflow-hidden",
        box,
        accentClasses
      )}
    >
      {gpt?.icon_url ? (
        <Image src={gpt.icon_url} alt="" fill sizes={px} className="object-cover" />
      ) : (
        <span
          className={cn(
            "font-display font-semibold leading-none",
            size === "lg" ? "text-base" : "text-[11px]"
          )}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
