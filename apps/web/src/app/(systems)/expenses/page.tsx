import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { StartButtons } from "@/systems/expenses/components/StartButtons";
import { ActivityList } from "@/systems/expenses/components/ActivityList";

export default async function ExpensesPage() {
  const token = await convexAuthNextjsToken();
  const [types, preloadedActivities] = await Promise.all([
    fetchQuery(api.expenses.types.list, {}, { token }),
    preloadQuery(api.expenses.activities.list, { limit: 30 }, { token }),
  ]);

  return (
    <article className="doc">
      <h1>Expenses</h1>
      <p className="overline" style={{ marginTop: "var(--sp-4)" }}>Start an activity</p>
      <StartButtons types={types.map((t) => ({ id: t.id, name: t.name }))} />
      <p className="overline" style={{ marginTop: "var(--sp-8)" }}>Recent</p>
      <ActivityList preloaded={preloadedActivities} />
    </article>
  );
}
