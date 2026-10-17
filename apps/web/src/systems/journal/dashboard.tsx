import { cache } from "react";
import Link from "next/link";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import type { SystemDashboard } from "../types";
import { firstLine, relativeTime } from "@polaris/core/format";

/** Day boundaries are the Asia/Manila calendar day, computed by the Convex
 *  query — the same rule as the journal's Today page. */
const load = cache(async () => {
  const token = await convexAuthNextjsToken();
  return fetchQuery(api.journal.dashboard.summary, {}, { token });
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
            href={`/journal/topics/${encodeURIComponent(lastEntry.topicName)}#entry-${lastEntry.id}`}
          >
            {lastEntry.title ?? snippet(lastEntry.body)}
          </Link>{" "}
          · {relativeTime(new Date(lastEntry.createdAt))}
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
