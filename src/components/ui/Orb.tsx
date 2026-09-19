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

// Firma de marca: burbuja de vidrio 3D con el wordmark Creativos como núcleo.
// Halo magenta (banda dominante del logo), atmósfera estática, caústico,
// rim-light del espectro y highlight que respira. Animaciones solo
// bajo prefers-reduced-motion: no-preference.
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
