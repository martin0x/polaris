import { prisma } from "@/platform/db/client";
import { lastNMonthKeys, manilaMonthStart, type MonthBucket } from "../lib/months";

export interface MonthTotal {
  month: string; // "2026-06"
  typeId: string;
  typeName: string;
  totalCentavos: number;
}

export interface TypeStats {
  typeId: string;
  typeName: string;
  thisMonthCentavos: number;
  lastMonthCentavos: number;
  avgPerActivityCentavos: number;
  activityCount: number;
}

export interface Trends {
  months: MonthBucket[];
  byMonth: MonthTotal[];
  byType: TypeStats[];
}

export async function getTrends(months: 3 | 6 | 12, now: Date = new Date()): Promise<Trends> {
  const buckets = lastNMonthKeys(months, now);
  const since = manilaMonthStart(buckets[0].key);

  const rows = await prisma.$queryRaw<
    Array<{ month: string; typeId: string; typeName: string; total: bigint; activities: bigint }>
  >`
    SELECT to_char(a."startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM') AS month,
           a."typeId" AS "typeId",
           t.name AS "typeName",
           COALESCE(SUM(i."amountCentavos"), 0)::bigint AS total,
           COUNT(DISTINCT a.id)::bigint AS activities
    FROM expense_activities a
    JOIN expense_activity_types t ON t.id = a."typeId"
    LEFT JOIN expense_items i ON i."activityId" = a.id
    WHERE a."startedAt" >= ${since}
    GROUP BY 1, 2, 3
    ORDER BY 1;
  `;

  const byMonth: MonthTotal[] = rows.map((r) => ({
    month: r.month,
    typeId: r.typeId,
    typeName: r.typeName,
    totalCentavos: Number(r.total),
  }));

  const thisKey = buckets[buckets.length - 1].key;
  const lastKey = buckets.length > 1 ? buckets[buckets.length - 2].key : null;

  const statsByType = new Map<string, TypeStats & { totalAll: number }>();
  for (const r of rows) {
    let s = statsByType.get(r.typeId);
    if (!s) {
      s = {
        typeId: r.typeId,
        typeName: r.typeName,
        thisMonthCentavos: 0,
        lastMonthCentavos: 0,
        avgPerActivityCentavos: 0,
        activityCount: 0,
        totalAll: 0,
      };
      statsByType.set(r.typeId, s);
    }
    const total = Number(r.total);
    s.totalAll += total;
    s.activityCount += Number(r.activities);
    if (r.month === thisKey) s.thisMonthCentavos = total;
    if (lastKey && r.month === lastKey) s.lastMonthCentavos = total;
  }

  const byType: TypeStats[] = [...statsByType.values()].map(({ totalAll, ...s }) => ({
    ...s,
    avgPerActivityCentavos: s.activityCount > 0 ? Math.round(totalAll / s.activityCount) : 0,
  }));

  return { months: buckets, byMonth, byType };
}
