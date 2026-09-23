"use client";

import { useEffect, useRef } from "react";

// Puerto literal de `animateThinkingEnergy` + el loop de `#energyCanvas`
// (home, speed 0.0009) en Creativos-AI-React/src/runtime.js.
// No recentrar el campo: los blobs van en x = w*(.30+i*.135) y el glow
// se pinta con fillRect, no con un arc recortado.

export const ENERGY_HOME = { size: 82, speed: 0.0009 } as const;
export const ENERGY_GPT = { size: 58, speed: 0.0025 } as const;
export const ENERGY_DEFAULT_SPEED = 0.0021;
export const ENERGY_LOOP_STEPS = 160;
export const ENERGY_CONTOURS = 7;

const BLOB_COLORS: [number, number, number][] = [
  [255, 135, 49],
  [255, 40, 101],
  [220, 24, 215],
  [120, 65, 255],
];

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

export function energyBlobCenter(w: number, h: number, t: number, i: number) {
  return {
    x: w * (0.3 + i * 0.135) + Math.sin(t + i) * 5,
    y: h * 0.5 + Math.cos(t * 1.3 + i * 1.4) * 8,
  };
}

export function energyContourPoint(
  w: number,
  h: number,
  t: number,
  i: number,
  k: number,
  steps = ENERGY_LOOP_STEPS,
) {
  const a = (k / steps) * Math.PI * 2;
  const r =
    1 +
    0.115 * Math.sin(3 * a + t * 1.4 + i * 0.57) +
    0.07 * Math.cos(5 * a - t * 0.8 + i * 0.38);
  return {
    x: w / 2 + Math.cos(a) * w * 0.3 * r,
    y:
      h / 2 +
      Math.sin(a) * h * (0.3 + 0.022 * Math.sin(t + i)) * r +
      Math.sin(2 * a + t + i * 0.44) * h * 0.035,
  };
}

export default function EnergyCanvas({
  size,
  speed = ENERGY_DEFAULT_SPEED,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let alive = true;
    let visible = true;

    function draw(ms: number) {
      if (!alive || !canvas || !ctx || !canvas.isConnected) return;

      const box = canvas.getBoundingClientRect();
      const w = box.width / 2 || size;
      const h = box.height / 2 || size;
      if (!w || !h) {
        frameId = 0;
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(w * 2 * dpr);
      const targetH = Math.round(h * 2 * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w * 2, h * 2);
      ctx.translate(w / 2, h / 2);
      const t = motion.matches ? 1.5 : ms * speed;

      ctx.globalCompositeOperation = "screen";

      BLOB_COLORS.forEach((c, i) => {
        const { x, y } = energyBlobCenter(w, h, t, i);
        const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.47);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.12)`);
        g.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},.045)`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-w / 2, -h / 2, w * 2, h * 2);
      });

      const gradient = ctx.createLinearGradient(w * 0.15, h * 0.24, w * 0.85, h * 0.75);
      for (const [stop, color] of STROKE_STOPS) gradient.addColorStop(stop, color);

      function loop(i: number) {
        if (!ctx) return;
        ctx.beginPath();
        for (let k = 0; k <= ENERGY_LOOP_STEPS; k++) {
          const { x, y } = energyContourPoint(w, h, t, i, k);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }

      for (let pass = 0; pass < 2; pass++) {
        ctx.filter = pass === 0 ? "blur(5px)" : "none";
        ctx.strokeStyle = gradient;
        for (let i = 0; i < ENERGY_CONTOURS; i++) {
          loop(i);
          ctx.globalAlpha = pass === 0 ? 0.17 : 0.16 + (0.5 + 0.5 * Math.sin(t + i)) * 0.12;
          ctx.lineWidth = pass === 0 ? 4 : 0.8 + i * 0.08;
          ctx.stroke();
        }
      }

      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      frameId = 0;
      if (!motion.matches && canvas.isConnected && visible && !document.hidden) {
        frameId = requestAnimationFrame(draw);
      }
    }

    function restart() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      if (visible && !document.hidden) frameId = requestAnimationFrame(draw);
    }

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      restart();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(restart);
    ro.observe(canvas);
    motion.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    restart();

    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
      io.disconnect();
      ro.disconnect();
      motion.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
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
