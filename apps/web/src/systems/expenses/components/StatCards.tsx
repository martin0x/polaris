import { formatCentavos } from "../lib/money";

export interface TypeStatsRow {
  typeId: string;
  typeName: string;
  thisMonthCentavos: number;
  lastMonthCentavos: number;
  avgPerActivityCentavos: number;
  activityCount: number;
}

export function StatCards({ stats }: { stats: TypeStatsRow[] }) {
  if (stats.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "var(--sp-3)",
        marginBottom: "var(--sp-6)",
      }}
    >
      {stats.map((s) => (
        <div key={s.typeId} className="paper-card" style={{ padding: "var(--sp-4)" }}>
          <p className="overline" style={{ margin: 0 }}>{s.typeName}</p>
          <p style={{ margin: "var(--sp-1) 0 0", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xl)", fontWeight: 500 }}>
            {formatCentavos(s.thisMonthCentavos)}
          </p>
          <p className="caption" style={{ margin: "var(--sp-1) 0 0", color: "var(--fg-muted)" }}>
            {formatCentavos(s.lastMonthCentavos)} last month ·{" "}
            {formatCentavos(s.avgPerActivityCentavos)} avg · {s.activityCount}{" "}
            {s.activityCount === 1 ? "activity" : "activities"}
          </p>
        </div>
      ))}
    </div>
  );
}
