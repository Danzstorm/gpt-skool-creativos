const SPECTRUM = [
  ["0%", "#ffbd16"],
  ["22%", "#ff682f"],
  ["46%", "#ff165e"],
  ["73%", "#ee0de4"],
  ["100%", "#7753ff"],
] as const;

interface Props {
  id: string;
}

/** Rim reactivo al puntero del prototipo (halo + borde espectral). */
export default function HaloRim({ id }: Props) {
  return (
    <>
      <span className="edge-wrap halo" aria-hidden>
        <span className="edge-glow">
          <svg className="rim-svg" aria-hidden>
            <defs>
              <linearGradient id={`halo-rim-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {SPECTRUM.map(([offset, color]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
            <rect className="rim-path" x="0.5" y="0.5" rx="11.5" stroke={`url(#halo-rim-${id})`} />
          </svg>
        </span>
      </span>
      <span className="edge-wrap" aria-hidden>
        <span className="edge-glow">
          <svg className="rim-svg" aria-hidden>
            <defs>
              <linearGradient id={`rim-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {SPECTRUM.map(([offset, color]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
            <rect className="rim-path" x="0.5" y="0.5" rx="11.5" stroke={`url(#rim-${id})`} />
          </svg>
        </span>
      </span>
    </>
  );
}
