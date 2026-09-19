import { cn } from "@/lib/utils";

// Sombra interna a escala: el desplazamiento de md/xl aplastaría la esfera de
// 20px del sidebar.
const SIZES = {
  xs: { px: 20, shadow: "inset -2px -3px 6px rgba(0,0,0,.45)" },
  md: { px: 96, shadow: "inset -8px -12px 24px rgba(0,0,0,.45)" },
  xl: { px: 160, shadow: "inset -8px -12px 24px rgba(0,0,0,.45)" },
} as const;

interface Props {
  size: keyof typeof SIZES;
  className?: string;
}

// Firma de marca: esfera 100% CSS. Halo exterior con el gradiente de marca,
// núcleo cónico que gira lento, brillo radial arriba-izquierda y sombra
// interna. orb-core / orb-spin / orb-breathe viven en globals.css; las
// animaciones solo corren bajo prefers-reduced-motion: no-preference.
export default function Orb({ size, className }: Props) {
  const { px, shadow } = SIZES[size];
  return (
    <div
      aria-hidden="true"
      className={cn("relative rounded-full shrink-0", className)}
      style={{ width: px, height: px }}
    >
      <div
        className="orb-breathe absolute inset-0 rounded-full blur-2xl opacity-40"
        style={{ background: "var(--brand-gradient)" }}
      />
      <div className="orb-core orb-spin absolute inset-0 rounded-full overflow-hidden" />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, rgba(255,255,255,.55), rgba(255,255,255,0) 45%)",
        }}
      />
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: shadow }} />
    </div>
  );
}
