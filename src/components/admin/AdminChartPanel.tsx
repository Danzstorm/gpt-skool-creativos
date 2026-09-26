"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatChartValue, formatMonthLabel, type ChartFormat } from "@/lib/admin-summary";
import { cn } from "@/lib/utils";
import { adminPanelClass, periodPillActiveClass, periodPillClass } from "./admin-ui";

export function AdminMonthPill({
  value,
  active,
  max,
}: {
  value: string;
  active: boolean;
  max: string;
}) {
  const router = useRouter();
  return (
    <label id="axCustomDates" className={cn(periodPillClass, "relative capitalize", active && periodPillActiveClass)}>
      {formatMonthLabel(value)}
      <input
        type="month"
        name="month"
        min="2020-01"
        max={max}
        value={value}
        aria-label="Elegir mes"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => router.push(`/admin?month=${e.target.value}`)}
      />
    </label>
  );
}

export type ChartMetric = {
  label: string;
  value: string;
  hint?: string;
  series: number[];
  format: ChartFormat;
  chartLabel: string;
};

type Props = {
  title: string;
  chartKey: string;
  metrics: ChartMetric[];
  dates: string[];
  /** Rango visible, a la derecha del título del gráfico ("01-set. – 26-set."). */
  rangeLabel: string;
  /** Nota fija bajo el gráfico; si falta, se usa la pista de la métrica elegida. */
  note?: string;
};

const axisDateClass = "fill-[#9999a5] stroke-none [font:12px_Inter,sans-serif]";

function polylinePoints(series: number[], max: number): string {
  const count = series.length;
  if (!count) return "";
  return series
    .map((value, i) => {
      const x = 45 + (i * 850) / Math.max(1, count - 1);
      const y = 205 - (value / max) * 170;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const chartX = (i: number, count: number) => 45 + (i * 850) / Math.max(1, count - 1);

export default function AdminChartPanel({ title, chartKey, metrics, dates, rangeLabel, note }: Props) {
  const [index, setIndex] = useState(0);
  // Punto bajo el cursor (o elegido con flechas). null = tooltip oculto.
  const [hover, setHover] = useState<number | null>(null);
  const lastHover = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const metric = metrics[Math.min(index, metrics.length - 1)];
  const series = useMemo(() => metric?.series ?? [], [metric]);
  const max = Math.max(...series, 0) * 1.15 || 1;
  const points = useMemo(() => polylinePoints(series, max), [series, max]);
  const count = series.length;
  const labels = [0, 0.5, 1].map((t) =>
    metric ? formatChartValue(metric.format, max * t) : ""
  );
  const shown = hover === null ? null : Math.min(hover, count - 1);

  // Ubica el tooltip sobre el punto, centrado y sin salirse del panel (Martin).
  useLayoutEffect(() => {
    const section = sectionRef.current, svg = svgRef.current, tip = tipRef.current;
    if (shown === null || !section || !svg || !tip) return;
    const box = svg.getBoundingClientRect(), p = section.getBoundingClientRect();
    const x = chartX(shown, count), y = 205 - (series[shown] / max) * 170;
    tip.style.left = Math.max(10, Math.min(section.clientWidth - tip.offsetWidth - 10, box.left - p.left + (x / 930) * box.width - tip.offsetWidth / 2)) + "px";
    tip.style.top = Math.max(8, box.top - p.top + (y / 240) * box.height - tip.offsetHeight - 15) + "px";
  }, [shown, count, series, max]);

  const showAt = (i: number) => {
    lastHover.current = i;
    setHover(i);
  };

  return (
    <section ref={sectionRef} className={cn(adminPanelClass, "relative mb-7 p-[22px]")}>
      <h2 className="mb-[18px] text-[20px] font-normal">{title}</h2>
      <div
        className={cn(
          "mb-6 grid gap-[10px]",
          metrics.length === 3
            ? "grid-cols-3 max-[700px]:grid-cols-2"
            : "grid-cols-4 max-[700px]:grid-cols-2 max-[380px]:grid-cols-1"
        )}
      >
        {metrics.map((item, i) => (
          <button
            key={item.label}
            type="button"
            data-block={chartKey}
            data-index={i}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i);
              setHover(null);
            }}
            className="block min-w-0 rounded-[12px] border border-solid border-[#ffffff0c] bg-[#131315] px-3 py-[14px] text-left [transition:background_.25s,border-color_.25s] hover:bg-[#19191c] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#b76c99] aria-pressed:border-[#ad64873d] aria-pressed:bg-[linear-gradient(120deg,#ff682f0c,#ff165e12,#7753ff15)]"
          >
            <span className="block text-[11px] leading-[1.5] text-[#9999a2]">{item.label}</span>
            <strong className="mt-[9px] block text-[24px] font-normal">{item.value}</strong>
            {item.hint ? (
              <small className="mt-[9px] block truncate text-[9px] leading-[1.5] text-[#74747f]">{item.hint}</small>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mb-[22px] flex items-center justify-between gap-3 max-[700px]:flex-wrap">
        <h2 className="text-[16px]">{metric?.chartLabel}</h2>
        <span className="text-[10px] text-[#777782]">{rangeLabel}</span>
      </div>
      {count > 0 ? (
        <svg
          ref={svgRef}
          data-chart={chartKey}
          tabIndex={0}
          className="block h-auto w-full overflow-visible fill-none stroke-none focus-visible:outline-none"
          viewBox="0 0 930 240"
          role="img"
          aria-label={metric.chartLabel}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((((e.clientX - r.left) / r.width) * 930 - 45) / 850) * (count - 1));
            showAt(Math.max(0, Math.min(count - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onFocus={() => showAt(lastHover.current)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              showAt(Math.max(0, Math.min(count - 1, (shown ?? lastHover.current) + (e.key === "ArrowRight" ? 1 : -1))));
            }
            if (e.key === "Escape") setHover(null);
          }}
        >
          <defs>
            <linearGradient id={`stroke${chartKey}`}>
              <stop stopColor="#d98455" />
              <stop offset=".5" stopColor="#cb4a8b" />
              <stop offset="1" stopColor="#9871c4" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t, i) => (
            <g key={t}>
              <line x1="45" x2="895" y1={205 - t * 170} y2={205 - t * 170} stroke="#ffffff0b" />
              <text x="0" y={209 - t * 170} className="fill-[#74747f] stroke-none [font:10px_Inter,sans-serif]">
                {labels[i]}
              </text>
            </g>
          ))}
          <polyline points={points} fill="none" stroke={`url(#stroke${chartKey})`} strokeWidth="2.5" />
          {series.map((value, i) => {
            const x = 45 + (i * 850) / Math.max(1, count - 1);
            const y = 205 - (value / max) * 170;
            return (
              <circle
                key={dates[i] ?? i}
                cx={x}
                cy={y}
                r={count === 1 ? 4 : 6}
                fill={count === 1 ? "#cb4a8b" : "transparent"}
                className="hover:fill-[#ce71a3]"
              >
                <title>
                  {dates[i]}: {formatChartValue(metric.format, value)}
                </title>
              </circle>
            );
          })}
          <text className={axisDateClass} x="45" y="235">
            {dates[0] ?? ""}
          </text>
          <text className={axisDateClass} x="895" y="235" textAnchor="end">
            {dates[count - 1] ?? ""}
          </text>
          <line
            x1={shown === null ? 0 : chartX(shown, count)}
            x2={shown === null ? 0 : chartX(shown, count)}
            y1="25"
            y2="205"
            className={cn(
              "pointer-events-none stroke-[#c4c4ca] [stroke-dasharray:4_4] transition-opacity duration-[120ms] motion-reduce:transition-none",
              shown === null ? "opacity-0" : "opacity-100"
            )}
          />
          <circle
            cx={shown === null ? 0 : chartX(shown, count)}
            cy={shown === null ? 0 : 205 - (series[shown] / max) * 170}
            r="4"
            className={cn(
              "pointer-events-none fill-[#ecc4db] stroke-[#8c526f] stroke-2 transition-opacity duration-[120ms] motion-reduce:transition-none",
              shown === null ? "opacity-0" : "opacity-100"
            )}
          />
        </svg>
      ) : (
        <p className="mt-2 px-5 py-[50px] text-center text-[13px] leading-[1.8] text-[#74747f]">No hay datos diarios en este período.</p>
      )}
      <p className="mt-[18px] text-[11px] leading-[1.8] text-[#888893]">{note ?? metric?.hint}</p>
      <div
        ref={tipRef}
        role="status"
        hidden={shown === null}
        className="pointer-events-none absolute z-[3] max-w-[calc(100%-20px)] rounded-[10px] border border-solid border-[#b76c9940] bg-[#242127] px-[14px] py-3 text-[12px] leading-[1.6] text-[#f0dce8] tabular-nums shadow-[0_8px_24px_#0006] [transition:left_140ms_cubic-bezier(.22,1,.36,1),top_140ms_cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
      >
        {shown !== null && `${dates[shown]} · ${metric.chartLabel}: ${formatChartValue(metric.format, series[shown])}`}
      </div>
    </section>
  );
}
