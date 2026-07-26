import { toUtcDate } from "../../lib/dates";

function cellColor(intensity: number): string {
  const step = Math.round(intensity * 4) / 4;
  return `color-mix(in oklab, var(--success) ${Math.round(step * 100)}%, var(--paper-2))`;
}

export function CalendarHeatmap({
  calendar,
}: {
  calendar: Array<{ date: string; intensity: number }>;
}) {
  if (calendar.length === 0) return null;
  // Pad so the first column starts on a Monday (grid flows column-first, 7 rows).
  const pad = (toUtcDate(calendar[0].date).getUTCDay() + 6) % 7;
  return (
    <div className="habit-cal-heatmap">
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad${i}`} className="habit-cal-cell is-blank" />
      ))}
      {calendar.map((c) => (
        <span
          key={c.date}
          className="habit-cal-cell"
          style={{ background: cellColor(c.intensity) }}
          title={`${c.date}: ${Math.round(c.intensity * 100)}%`}
        />
      ))}
    </div>
  );
}
