"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCentavos } from "../lib/money";

export interface TrendsChartProps {
  months: Array<{ key: string; label: string }>;
  byMonth: Array<{ month: string; typeName: string; totalCentavos: number }>;
}

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const TICK_STYLE = {
  fill: "var(--fg-faint)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

export function TrendsChart({ months, byMonth }: TrendsChartProps) {
  const typeNames = [...new Set(byMonth.map((r) => r.typeName))];
  const data = months.map((m) => {
    const row: Record<string, string | number> = { month: m.label };
    for (const t of typeNames) {
      row[t] =
        (byMonth.find((r) => r.month === m.key && r.typeName === t)?.totalCentavos ?? 0) / 100;
    }
    return row;
  });

  if (typeNames.length === 0) {
    return <p className="lead">No activity in this range yet.</p>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={3} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={TICK_STYLE} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={TICK_STYLE}
            tickFormatter={(v: number) => (v === 0 ? "0" : `₱${v >= 1000 ? `${v / 1000}k` : v}`)}
          />
          <Tooltip
            formatter={(v) => formatCentavos(Math.round(Number(v) * 100))}
            cursor={{ fill: "var(--bg-sunken)" }}
            contentStyle={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              fontSize: "var(--fs-sm)",
              fontFamily: "var(--font-sans)",
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}
          />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "var(--fs-sm)" }} />
          {typeNames.map((t, i) => (
            <Bar key={t} dataKey={t} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
