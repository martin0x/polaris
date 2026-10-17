import { getWeek } from "@/systems/habits/services/ticks";
import { todayString } from "@polaris/core/dates";
import { HabitTracker } from "@/systems/habits/components/HabitTracker";

export default async function HabitsPage() {
  const week = await getWeek(todayString());
  return (
    <article className="doc">
      <h1>Habits</h1>
      <HabitTracker initialWeek={week} />
    </article>
  );
}
