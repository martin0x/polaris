import { getChartsData } from "@/systems/habits/services/charts";
import { ConsistencyTrend } from "@/systems/habits/components/charts/ConsistencyTrend";
import { StreakTiles } from "@/systems/habits/components/charts/StreakTiles";
import { DayOfWeekHeatmap } from "@/systems/habits/components/charts/DayOfWeekHeatmap";
import { CalendarHeatmap } from "@/systems/habits/components/charts/CalendarHeatmap";

export default async function HabitsChartsPage() {
  const data = await getChartsData();

  if (!data.hasTicks) {
    return (
      <article className="doc">
        <h1>Charts</h1>
        <p className="lead">Nothing to chart yet.</p>
        <p className="caption">Tick a few days on the tracker first.</p>
      </article>
    );
  }

  return (
    <article className="doc">
      <h1>Charts</h1>

      <section className="habit-chart-block">
        <h2>Consistency</h2>
        <p className="caption">Weekly completion — repetition consistency is what builds automaticity.</p>
        <ConsistencyTrend weeks={data.weeks} />
      </section>

      <section className="habit-chart-block">
        <h2>Streaks and recovery</h2>
        <p className="caption">One missed day doesn't break a habit — two in a row is the signal.</p>
        <StreakTiles streaks={data.streaks} />
      </section>

      <section className="habit-chart-block">
        <h2>Day-of-week patterns</h2>
        <p className="caption">Habits are context-cued — weak days point at missing cues, not weak will.</p>
        <DayOfWeekHeatmap weekday={data.weekday} />
      </section>

      <section className="habit-chart-block">
        <h2>Past 90 days</h2>
        <CalendarHeatmap calendar={data.calendar} />
      </section>
    </article>
  );
}
