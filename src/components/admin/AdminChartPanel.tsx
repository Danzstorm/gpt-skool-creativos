"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatChartValue, formatMonthLabel, type ChartFormat } from "@/lib/admin-summary";
import { cn } from "@/lib/utils";
import { adminPanelClass } from "./admin-ui";

// Pastilla de período del Resumen (7/30/90 días y mes).
export const periodPillClass = "rounded-[7px] px-[11px] py-[9px] text-[11px] text-[#888893] no-underline";
export const periodPillActiveClass = "bg-[linear-gradient(110deg,#ff682f12,#ff165e22,#7753ff22)] text-[#f0cadb]";

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

export default function AdminChartPanel({ title, chartKey, metrics, dates }: Props) {
  const [index, setIndex] = useState(0);
  const metric = metrics[Math.min(index, metrics.length - 1)];
  const series = metric?.series ?? [];
  const max = Math.max(...series, 0) * 1.15 || 1;
  const points = useMemo(() => polylinePoints(series, max), [series, max]);
  const count = series.length;
  const labels = [0, 0.5, 1].map((t) =>
    metric ? formatChartValue(metric.format, max * t) : ""
  );

  return (
    <section className={cn(adminPanelClass, "relative mb-7 p-[22px]")}>
      <h2 className="!mb-[18px] !text-[20px] font-normal">{title}</h2>
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
            onClick={() => setIndex(i)}
            className="block min-w-0 rounded-[12px] border border-solid border-[#ffffff0c] bg-[#131315] px-3 py-[14px] text-left ![transition:background_.25s,border-color_.25s] hover:bg-[#19191c] focus-visible:!outline-2 focus-visible:!outline-offset-3 focus-visible:!outline-[#b76c99] aria-pressed:border-[#ad64873d] aria-pressed:bg-[linear-gradient(120deg,#ff682f0c,#ff165e12,#7753ff15)]"
          >
            <span className="block text-[11px] leading-[1.5] text-[#9999a2]">{item.label}</span>
            <strong className="mt-[9px] block text-[24px] font-normal">{item.value}</strong>
            {item.hint ? (
              <small className="mt-[9px] block truncate text-[9px] leading-[1.5] text-[#74747f]">{item.hint}</small>
            ) : null}
          </button>
        ))}
      </div>
      {count > 0 ? (
        <svg
          data-chart={chartKey}
          className="block h-auto w-full overflow-visible fill-none stroke-none"
          viewBox="0 0 930 240"
          role="img"
          aria-label={metric.chartLabel}
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
        </svg>
      ) : (
        <p className="mt-2 px-5 py-[50px] text-center text-[13px] leading-[1.8] text-[#74747f]">No hay datos diarios en este período.</p>
      )}
    </section>
  );
}
