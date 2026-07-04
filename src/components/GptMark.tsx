import Image from "next/image";
import { cn } from "@/lib/utils";
import { getGptVisual } from "@/lib/gpt-visual";

// Marca visual canónica de un GPT. Si tiene icon_url usa la imagen; si no,
// muestra su inicial en serif (Fraunces) sobre el gradiente de su categoría.
// El monograma serif hace que cada GPT sin logo propio se vea intencional
// y de estudio, no como una caja genérica.
export default function GptMark({
  name,
  iconUrl,
  category,
  className,
  sizePx = 48,
  initialClassName = "text-xl",
}: {
  name: string;
  iconUrl?: string | null;
  category?: string | null;
  className?: string;
  sizePx?: number;
  initialClassName?: string;
}) {
  const { accentClasses } = getGptVisual(category);
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "•";

  return (
    <span
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center overflow-hidden border bg-gradient-to-br",
        accentClasses,
        className
      )}
    >
      {iconUrl ? (
        <Image src={iconUrl} alt="" fill sizes={`${sizePx}px`} className="object-cover" />
      ) : (
        <span className={cn("font-display font-semibold leading-none", initialClassName)}>
          {initial}
        </span>
      )}
    </span>
  );
}
