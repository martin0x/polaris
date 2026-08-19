"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const TICK_STYLE = {
  fill: "var(--fg-faint)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

export function ConsistencyTrend({
  weeks,
}: {
  weeks: Array<{ label: string; complete: number; partial: number }>;
}) {
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={TICK_STYLE} />
          <YAxis
            tickLine={false} axisLine={false} width={40} tick={TICK_STYLE}
            domain={[0, 100]} tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(v: number, name: string) => [`${v}%`, name]}
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
          <Bar dataKey="complete" name="Complete" stackId="a" fill="var(--chart-4)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="partial" name="Partial" stackId="a" fill="var(--chart-5)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
