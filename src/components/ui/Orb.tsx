import { cn } from "@/lib/utils";

// Sombra y highlight a escala: el desplazamiento de md/xl aplastaría la
// esfera de 20px del sidebar.
const SIZES = {
  xs: 20,
  md: 104,
  xl: 168,
} as const;

interface Props {
  size: keyof typeof SIZES;
  className?: string;
}

// Firma: esfera de vidrio líquido con el wordmark oficial. Nunca una C.
// En xs el lockup del sidebar ya lleva "CREATIVOS" al lado — la gema va sola.
export default function Orb({ size, className }: Props) {
  const px = SIZES[size];
  const word = size === "xs" ? null : "CREATIVOS";

  return (
    <div
      aria-hidden="true"
      className={cn("orb relative shrink-0", `orb-${size}`, className)}
      style={{ width: px, height: px }}
    >
      <div className="orb-halo orb-breathe" />
      <div className="orb-sphere">
        <div className="orb-atmosphere" />
        <div className="orb-caustic orb-water" />
        <div className="orb-refract orb-refract-drift" />
        {word && (
          <span className="orb-mark orb-mark-word font-display italic uppercase font-extrabold">
            {word}
          </span>
        )}
        <div className="orb-film" />
        <div className="orb-highlight orb-shimmer" />
        <div className="orb-shade" />
        <div className="orb-rim" />
      </div>
    </div>
  );
}
