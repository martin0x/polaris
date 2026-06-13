import Link from "next/link";
import { getTrends } from "@/systems/expenses/services/trends";
import { TrendsChart } from "@/systems/expenses/components/TrendsChart";
import { StatCards } from "@/systems/expenses/components/StatCards";

const RANGES = [3, 6, 12] as const;

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months: monthsParam } = await searchParams;
  const months = RANGES.includes(Number(monthsParam) as 3 | 6 | 12)
    ? (Number(monthsParam) as 3 | 6 | 12)
    : 6;
  const trends = await getTrends(months);

  return (
    <article className="doc">
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
        <h1>Trends</h1>
        <nav aria-label="Range" style={{ display: "flex", gap: "var(--sp-1)" }}>
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/expenses/trends?months=${r}`}
              className={r === months ? "btn btn-secondary" : "btn btn-ghost"}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {r}m
            </Link>
          ))}
        </nav>
      </header>
      <StatCards stats={trends.byType} />
      <TrendsChart months={trends.months} byMonth={trends.byMonth} />
    </article>
  );
}
