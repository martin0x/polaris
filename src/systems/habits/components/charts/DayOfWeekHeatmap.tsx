import { Fragment } from "react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cellColor(mean: number): string {
  const step = Math.round(mean * 4) / 4; // 5-step intensity
  return `color-mix(in oklab, var(--success) ${Math.round(step * 100)}%, var(--paper-2))`;
}

export function DayOfWeekHeatmap({
  weekday,
}: {
  weekday: Array<{ id: string; name: string; means: number[] }>;
}) {
  return (
    <div className="habit-dow-heatmap">
      <span />
      {DAY_LABELS.map((d) => (
        <span key={d} className="habit-dow-label">{d}</span>
      ))}
      {weekday.map((h) => (
        <Fragment key={h.id}>
          <span className="habit-dow-name">{h.name}</span>
          {h.means.map((mean, i) => (
            <span
              key={i}
              className="habit-dow-cell"
              style={{ background: cellColor(mean) }}
              title={`${h.name}, ${DAY_LABELS[i]}: ${Math.round(mean * 100)}%`}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
