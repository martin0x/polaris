import { cache } from "react";
import Link from "next/link";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import type { SystemDashboard } from "../types";
import { StartButtons } from "./components/StartButtons";
import { formatCentavos } from "@polaris/core/money";
import { MANILA_TZ } from "@polaris/core/months";

/** Month and day boundaries are computed server-side by the Convex query,
 *  following the same Asia/Manila rule as the trends service. */
const load = cache(async () => {
  const token = await convexAuthNextjsToken();
  return fetchQuery(api.expenses.dashboard.summary, {}, { token });
});

async function summary(): Promise<string | null> {
  const { monthCentavos, todayActivity } = await load();
  const spend =
    monthCentavos > 0
      ? `${formatCentavos(monthCentavos)} spent this month`
      : "nothing spent this month";
  return todayActivity
    ? `${spend}, ${todayActivity.title ?? todayActivity.typeName} in progress`
    : spend;
}

async function Widget() {
  const { monthCentavos, todayActivity, types } = await load();
  const monthName = new Date().toLocaleString("en-US", {
    month: "long",
    timeZone: MANILA_TZ,
  });
  return (
    <section className="paper-card dash-card">
      <span className="overline">Expenses</span>
      <p className="dash-card-stat">
        {formatCentavos(monthCentavos)}
        <span className="dash-card-stat-caption"> {monthName} so far</span>
      </p>
      {todayActivity ? (
        <p className="dash-card-detail">
          Continue:{" "}
          <Link href={`/expenses/${todayActivity.id}`}>
            {todayActivity.title ?? todayActivity.typeName}
          </Link>{" "}
          · {todayActivity.items} {todayActivity.items === 1 ? "item" : "items"} ·{" "}
          {formatCentavos(todayActivity.totalCentavos)}
        </p>
      ) : null}
      <div className="dash-card-actions">
        <StartButtons types={types} />
      </div>
    </section>
  );
}

export const dashboard: SystemDashboard = { name: "expenses", summary, Widget };
