"use client";

import { useEffect, useRef } from "react";

// Blobs radiales (RGB, no hex: se interpolan con alpha por frame).
const BLOB_COLORS: [number, number, number][] = [
  [255, 135, 49],
  [255, 40, 101],
  [220, 24, 215],
  [120, 65, 255],
];

// Gradiente de trazo compartido por los 7 contornos.
const STROKE_STOPS: [number, string][] = [
  [0, "#ffb342"],
  [0.27, "#ff526b"],
  [0.52, "#ff2caf"],
  [0.76, "#cf41ef"],
  [1, "#7e67ff"],
];

interface Props {
  /** Lado del slot visible en CSS px. El bitmap se dibuja al doble; el CSS del slot (200% / -50%) recorta el bleed. */
  size: number;
  /** Velocidad temporal: .0009 bienvenida, .0025 header GPT/acceso, .0021 pensando, .0045 carga de imagen. */
  speed?: number;
  className?: string;
}

// Puerto directo de `animateThinkingEnergy` del prototipo del cliente — no
// aproximar la fórmula del radio ni el orden de las pasadas, es lo que hace
// que el trazo se vea orgánico en vez de una onda regular.
export default function EnergyCanvas({ size, speed = 0.0021, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let alive = true;
    const w = size;
    const h = size;

    function draw(ts: number) {
      if (!alive || !canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(w * 2 * dpr);
      const targetH = Math.round(h * 2 * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w * 2, h * 2);
      ctx.translate(w, h);

      // Congelado en una fase fija con reduce-motion, no una imagen distinta.
      const t = motion.matches ? 1.5 : ts * speed;

      ctx.globalCompositeOperation = "screen";

      BLOB_COLORS.forEach(([r, g, b], i) => {
        const cx = Math.sin(t + i) * 5;
        const cy = Math.cos(t * 1.3 + i * 1.4) * 8;
        const radius = h * 0.47;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.12)`);
        grad.addColorStop(0.6, `rgba(${r},${g},${b},0.045)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      const strokeGrad = ctx.createLinearGradient(w * -0.35, h * -0.26, w * 0.35, h * 0.25);
      for (const [stop, color] of STROKE_STOPS) strokeGrad.addColorStop(stop, color);

      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 160; k++) {
          const a = (k / 160) * Math.PI * 2;
          const r =
            1 +
            0.115 * Math.sin(3 * a + t * 1.4 + i * 0.57) +
            0.07 * Math.cos(5 * a - t * 0.8 + i * 0.38);
          const x = Math.cos(a) * w * 0.3 * r;
          const y =
            Math.sin(a) * h * (0.3 + 0.022 * Math.sin(t + i)) * r +
            Math.sin(2 * a + t + i * 0.44) * h * 0.035;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        ctx.filter = "blur(5px)";
        ctx.globalAlpha = 0.17;
        ctx.lineWidth = 4;
        ctx.strokeStyle = strokeGrad;
        ctx.stroke();

        ctx.filter = "none";
        ctx.globalAlpha = 0.16 + (0.5 + 0.5 * Math.sin(t + i)) * 0.12;
        ctx.lineWidth = 0.8 + i * 0.08;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (!motion.matches) frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
    };
  }, [size, speed]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={["energy-canvas", className].filter(Boolean).join(" ")}
    />
  );
}
