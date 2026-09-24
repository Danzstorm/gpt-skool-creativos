"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#ffb51d", "#ff672e", "#ff165e", "#e10ed7", "#7753ff"];

/** Fondo abstracto del acceso: ~30fps, factor .00032, grano soft-light. */
export default function AccessMotion() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const grain = document.createElement("canvas");
    grain.width = 256;
    grain.height = 256;
    const grainCtx = grain.getContext("2d");
    if (!grainCtx) return;
    const pixels = grainCtx.createImageData(256, 256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const tone = Math.random() * 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tone;
      pixels.data[i + 3] = 255;
    }
    grainCtx.putImageData(pixels, 0, 0);
    const pattern = ctx.createPattern(grain, "repeat");

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let last = 0;
    let alive = true;

    function draw(now: number) {
      if (!alive || !canvas || !ctx) return;
      frameId = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return;
      last = now;
      const t = motion.matches ? 0 : now * 0.00032;
      const w = Math.min(1100, window.innerWidth);
      const h = Math.round((w * window.innerHeight) / window.innerWidth);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#070609";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const phase = t + i * 1.1;
        const x = w * (0.5 + 0.52 * Math.sin(phase * 0.8 + i * 0.55));
        const y = h * (0.5 + 0.43 * Math.cos(phase * 0.65 + i));
        const r = Math.max(w, h) * (0.32 + 0.085 * Math.sin(phase * 1.2));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `${COLORS[i]}68`);
        g.addColorStop(0.42, `${COLORS[i]}30`);
        g.addColorStop(1, `${COLORS[i]}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
      const shade = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, Math.max(w, h) * 0.7);
      shade.addColorStop(0, "#060608aa");
      shade.addColorStop(0.45, "#06060844");
      shade.addColorStop(1, "#060608bb");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(6,6,7,.62)";
      ctx.fillRect(0, 0, w, h);
      if (pattern) {
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = 0.085;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }

    frameId = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-[-2] h-full w-full" aria-hidden />;
}
