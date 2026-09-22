"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMonthLabel } from "@/lib/admin-summary";

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
    <label id="axCustomDates" className={active ? "active" : undefined}>
      {formatMonthLabel(value)}
      <input
        type="month"
        name="month"
        min="2020-01"
        max={max}
        value={value}
        aria-label="Elegir mes"
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
  format: (n: number) => string;
  chartLabel: string;
};

type Props = {
  title: string;
  chartKey: string;
  metrics: ChartMetric[];
  dates: string[];
};

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
  const labels = [0, 0.5, 1].map((t) => metric?.format(max * t) ?? "");

  return (
    <section className="ax-panel ax-chart-panel">
      <h2 className="ax-block-title">{title}</h2>
      <div className="ax-stats ax-kpis ax-selectable">
        {metrics.map((item, i) => (
          <button
            key={item.label}
            type="button"
            data-block={chartKey}
            data-index={i}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.hint ? <small>{item.hint}</small> : null}
          </button>
        ))}
      </div>
      {count > 0 ? (
        <svg
          data-chart={chartKey}
          className="ax-chart"
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
              <text x="0" y={209 - t * 170}>
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
              >
                <title>
                  {dates[i]}: {metric.format(value)}
                </title>
              </circle>
            );
          })}
          <text className="ax-axis-date" x="45" y="235">
            {dates[0] ?? ""}
          </text>
          <text className="ax-axis-date" x="895" y="235" textAnchor="end">
            {dates[count - 1] ?? ""}
          </text>
        </svg>
      ) : (
        <p className="ax-empty-chart">No hay datos diarios en este período.</p>
      )}
    </section>
  );
}
