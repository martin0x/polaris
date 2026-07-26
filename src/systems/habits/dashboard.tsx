import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/platform/db/client";
import type { SystemDashboard } from "../types";
import { todayString, toUtcDate } from "./lib/dates";

const load = cache(async () => {
  const today = todayString();
  const [habits, ticks] = await Promise.all([
    prisma.habit.findMany({ where: { archived: false }, orderBy: { position: "asc" } }),
    prisma.habitTick.findMany({ where: { date: toUtcDate(today) } }),
  ]);
  return { habits, tickedIds: new Set(ticks.map((t) => t.habitId)) };
});

async function summary(): Promise<string | null> {
  const { habits, tickedIds } = await load();
  if (habits.length === 0) return null;
  return `${tickedIds.size} of ${habits.length} habits ticked today`;
}

async function Widget() {
  const { habits, tickedIds } = await load();
  const open = habits.filter((h) => !tickedIds.has(h.id));
  return (
    <section className="paper-card dash-card">
      <span className="overline">Habits</span>
      <p className="dash-card-stat">
        {habits.length === 0
          ? "No habits yet"
          : `${tickedIds.size} of ${habits.length} ticked today`}
      </p>
      {habits.length > 0 && (
        <p className="dash-card-detail">
          {open.length === 0
            ? "All ticked for today."
            : `Still open: ${open.map((h) => h.name).join(", ")}`}
        </p>
      )}
      <div className="dash-card-actions">
        <Link className="btn btn-secondary" href="/habits">
          Open tracker
        </Link>
      </div>
    </section>
  );
}

export const dashboard: SystemDashboard = { name: "habits", summary, Widget };
