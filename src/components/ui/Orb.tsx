import { cn } from "@/lib/utils";

// Sombra y highlight a escala: el desplazamiento de md/xl aplastaría la
// esfera de 20px del sidebar.
const SIZES = {
  xs: { px: 20, mark: "C" },
  md: { px: 104, mark: "CREATIVOS" },
  xl: { px: 168, mark: "CREATIVOS" },
} as const;

interface Props {
  size: keyof typeof SIZES;
  className?: string;
}

// Firma de marca: esfera de vidrio con el wordmark. Halo rojo contenido,
// no un bloom magenta a media pantalla. Motion solo sin reduce-motion.
export default function Orb({ size, className }: Props) {
  const { px, mark } = SIZES[size];
  const compact = size === "xs";

  return (
    <div
      aria-hidden="true"
      className={cn("orb relative shrink-0", `orb-${size}`, className)}
      style={{ width: px, height: px }}
    >
      <div className="orb-halo orb-breathe" />
      <div className="orb-sphere">
        <div className="orb-atmosphere" />
        <div className="orb-caustic orb-spin" />
        <span
          className={cn(
            "orb-mark font-display italic uppercase font-extrabold",
            compact ? "orb-mark-glyph" : "orb-mark-word"
          )}
        >
          {mark}
        </span>
        <div className="orb-film" />
        <div className="orb-highlight orb-shimmer" />
        <div className="orb-shade" />
        <div className="orb-rim" />
      </div>
    </div>
  );
}
