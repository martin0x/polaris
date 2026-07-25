import { getWeek } from "@/systems/habits/services/ticks";
import { todayString } from "@/systems/habits/lib/dates";
import { formatWeekRange } from "@/systems/habits/lib/dates";

export default async function HabitsPage() {
  const week = await getWeek(todayString());
  return (
    <article className="doc">
      <h1>Habits</h1>
      <p className="lead">{formatWeekRange(week.monday)} — {week.habits.length} habits</p>
    </article>
  );
}
