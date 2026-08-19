import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/platform/db/client";
import type { SystemDashboard } from "../types";
import { StartButtons } from "./components/StartButtons";
import { formatCentavos } from "./lib/money";
import { MANILA_TZ, manilaMonthKey, manilaMonthStart } from "./lib/months";
import { listTypes } from "./services/types";

interface TodayActivity {
  id: string;
  title: string | null;
  typeName: string;
  items: number;
  totalCentavos: number;
}

/** Month and day boundaries follow the trends service: Asia/Manila. */
const load = cache(async () => {
  const monthStart = manilaMonthStart(manilaMonthKey(new Date()));

  const [monthAgg, todayRows, types] = await Promise.all([
    prisma.expenseItem.aggregate({
      _sum: { amountCentavos: true },
      where: { activity: { startedAt: { gte: monthStart } } },
    }),
    prisma.$queryRaw<
      Array<{ id: string; title: string | null; typeName: string; items: bigint; total: bigint }>
    >`
      SELECT a.id, a.title, t.name AS "typeName",
             COUNT(i.id)::bigint AS items,
             COALESCE(SUM(i."amountCentavos"), 0)::bigint AS total
      FROM expense_activities a
      JOIN expense_activity_types t ON t.id = a."typeId"
      LEFT JOIN expense_items i ON i."activityId" = a.id
      WHERE (a."startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date
            = (now() AT TIME ZONE 'Asia/Manila')::date
      GROUP BY a.id, a.title, t.name, a."startedAt"
      ORDER BY a."startedAt" DESC
      LIMIT 1;
    `,
    listTypes({ includeArchived: false }),
  ]);

  const todayActivity: TodayActivity | null = todayRows[0]
    ? {
        id: todayRows[0].id,
        title: todayRows[0].title,
        typeName: todayRows[0].typeName,
        items: Number(todayRows[0].items),
        totalCentavos: Number(todayRows[0].total),
      }
    : null;

  return {
    monthCentavos: monthAgg._sum.amountCentavos ?? 0,
    todayActivity,
    types: types.map((t) => ({ id: t.id, name: t.name })),
  };
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
