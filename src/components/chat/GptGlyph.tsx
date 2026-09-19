import type { CSSProperties } from "react";
import type { Gpt } from "@/lib/types";
import { getGptVisual } from "@/lib/gpt-visual";
import GptLogo from "./GptLogo";

const LOGO_SIZE = {
  xs: "xs",
  sm: "xs",
  lg: "xs",
  xl: "md",
  hero: "md",
} as const;

interface Props {
  gpt?: Pick<Gpt, "name" | "icon_url" | "category"> & { description?: string | null };
  size?: keyof typeof LOGO_SIZE;
  className?: string;
}

// Marca canónica fuera del empty-state: badge de color del oficio (GptLogo).
// El héroe 3D del chat vacío sigue siendo GptMark.
export default function GptGlyph({ gpt, size = "sm", className }: Props) {
  const { markKind, accentHex } = getGptVisual(gpt?.category, gpt?.name, gpt?.description);
  const letter = gpt?.name?.trim()?.charAt(0)?.toUpperCase() || "G";

  return (
    <GptLogo
      kind={markKind}
      letter={letter}
      size={LOGO_SIZE[size]}
      iconUrl={gpt?.icon_url}
      className={className}
      style={{ "--craft": accentHex } as CSSProperties}
    />
  );
}
