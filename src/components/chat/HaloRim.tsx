const SPECTRUM = [
  ["0%", "#ffbd16"],
  ["22%", "#ff682f"],
  ["46%", "#ff165e"],
  ["73%", "#ee0de4"],
  ["100%", "#7753ff"],
] as const;

interface Props {
  id: string;
  card?: boolean;
}

/**
 * Rim reactivo al puntero (halo + borde espectral).
 * Absolute siempre: fuera de `.tool` del dump los spans entraban al flujo
 * y aplastaban el sidebar (caja vacía bajo el logo).
 */
export default function HaloRim({ id, card = false }: Props) {
  const cardMask = card
    ? "[mask-image:radial-gradient(circle_var(--edge-radius,125px)_at_var(--mx)_var(--my),#000_0%,#000e_18%,#0008_43%,#0002_72%,transparent_100%)]"
    : "";
  const cardHaloOpacity = card
    ? "!opacity-0 group-hover:!opacity-[calc(var(--edge-strength,0.55)*0.8)] group-focus-visible:!opacity-[calc(var(--edge-strength,0.55)*0.8)]"
    : "";
  const cardRimOpacity = card
    ? "!opacity-0 group-hover:!opacity-[var(--edge-strength,0.55)] group-focus-visible:!opacity-[var(--edge-strength,0.55)]"
    : "";
  return (
    <>
      <span
        className={`edge-wrap halo pointer-events-none absolute z-0 rounded-[inherit] ${cardMask} ${cardHaloOpacity} ${card ? "transition-none" : ""}`}
        style={{
          inset: "-16px",
          opacity: "calc(var(--edge-strength, 0) * 0.8)",
          filter: "blur(8px)",
        }}
        aria-hidden
      >
        <span className={`edge-glow absolute inset-[15px] rounded-[12px] ${card ? "[transition:opacity_.16s_ease]" : ""}`}>
          <svg
            className={`rim-svg absolute inset-0 block h-full w-full overflow-visible fill-none stroke-none ${card ? "shrink-0 !stroke-[1.4px]" : ""}`}
            aria-hidden
          >
            <defs>
              <linearGradient id={`halo-rim-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {SPECTRUM.map(([offset, color]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
            <rect
              className="rim-path"
              x="0.5"
              y="0.5"
              rx="11.5"
              stroke={`url(#halo-rim-${id})`}
              style={{
                width: "calc(100% - 1px)",
                height: "calc(100% - 1px)",
                fill: "none",
                strokeWidth: "1.2px",
                vectorEffect: "non-scaling-stroke",
              }}
            />
          </svg>
        </span>
      </span>
      <span
        className={`edge-wrap pointer-events-none absolute z-[2] rounded-[inherit] ${cardMask} ${cardRimOpacity} ${card ? "transition-none" : ""}`}
        style={{
          inset: "-16px",
          opacity: "var(--edge-strength, 0)",
        }}
        aria-hidden
      >
        <span className={`edge-glow absolute inset-[15px] rounded-[12px] ${card ? "[transition:opacity_.16s_ease]" : ""}`}>
          <svg
            className={`rim-svg absolute inset-0 block h-full w-full overflow-visible fill-none stroke-none ${card ? "shrink-0 !stroke-[1.4px]" : ""}`}
            aria-hidden
          >
            <defs>
              <linearGradient id={`rim-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {SPECTRUM.map(([offset, color]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
            <rect
              className="rim-path"
              x="0.5"
              y="0.5"
              rx="11.5"
              stroke={`url(#rim-${id})`}
              style={{
                width: "calc(100% - 1px)",
                height: "calc(100% - 1px)",
                fill: "none",
                strokeWidth: "0.7px",
                vectorEffect: "non-scaling-stroke",
              }}
            />
          </svg>
        </span>
      </span>
    </>
  );
}
