import { getWeek } from "@/systems/habits/services/ticks";
import { todayString } from "@/systems/habits/lib/dates";
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
