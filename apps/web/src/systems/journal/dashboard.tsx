import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/platform/db/client";
import type { SystemDashboard } from "../types";
import { firstLine, relativeTime } from "./lib/format";

/** Day boundaries mirror the journal's Today page: server-local midnight. */
const load = cache(async () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  const [todayCount, yesterdayCount, lastEntry] = await Promise.all([
    prisma.journalEntry.count({
      where: { deletedAt: null, createdAt: { gte: startOfToday } },
    }),
    prisma.journalEntry.count({
      where: {
        deletedAt: null,
        createdAt: { gte: startOfYesterday, lt: startOfToday },
      },
    }),
    prisma.journalEntry.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { topic: true },
    }),
  ]);
  return { todayCount, yesterdayCount, lastEntry };
});

function countPhrase(n: number, when: string): string {
  return `${n} ${n === 1 ? "entry" : "entries"} ${when}`;
}

/** firstLine keeps markdown list/heading markers; strip them for the card. */
function snippet(body: string): string {
  return firstLine(body, 60).replace(/^(?:[-*+]|\d+\.|#{1,6}|>|\[[ xX]\])\s+/, "");
}

async function summary(): Promise<string | null> {
  const { todayCount, yesterdayCount } = await load();
  if (todayCount > 0) return countPhrase(todayCount, "today");
  if (yesterdayCount > 0) return countPhrase(yesterdayCount, "yesterday");
  return "no entries yet today";
}

async function Widget() {
  const { todayCount, lastEntry } = await load();
  return (
    <section className="paper-card dash-card">
      <span className="overline">Journal</span>
      <p className="dash-card-stat">
        {todayCount === 0 ? "No entries today" : countPhrase(todayCount, "today")}
      </p>
      {lastEntry ? (
        <p className="dash-card-detail">
          Last entry:{" "}
          <Link
            href={`/journal/topics/${encodeURIComponent(lastEntry.topic.name)}#entry-${lastEntry.id}`}
          >
            {lastEntry.title ?? snippet(lastEntry.body)}
          </Link>{" "}
          · {relativeTime(lastEntry.createdAt)}
        </p>
      ) : (
        <p className="dash-card-detail">Nothing logged yet.</p>
      )}
      <div className="dash-card-actions">
        <Link className="btn btn-secondary" href="/journal">
          Capture a thought
        </Link>
      </div>
    </section>
  );
}

export const dashboard: SystemDashboard = { name: "journal", summary, Widget };
