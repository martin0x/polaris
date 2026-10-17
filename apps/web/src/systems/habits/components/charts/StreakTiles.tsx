export function StreakTiles({
  streaks,
}: {
  streaks: Array<{ id: string; name: string; current: number; longest: number; lapses90: number }>;
}) {
  return (
    <div className="habit-streak-tiles">
      {streaks.map((s) => (
        <div key={s.id} className="paper-card habit-streak-tile">
          <span className="overline">{s.name}</span>
          <p className="habit-streak-current">{s.current}</p>
          <p className="caption">
            day streak · longest {s.longest} · {s.lapses90} {s.lapses90 === 1 ? "lapse" : "lapses"} in 90 days
          </p>
        </div>
      ))}
    </div>
  );
}
