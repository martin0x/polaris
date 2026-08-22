import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { ActivitiesHome } from "@/systems/expenses/components/ActivitiesHome";

export default async function ExpensesPage() {
  const token = await convexAuthNextjsToken();
  const [types, preloadedActivities] = await Promise.all([
    fetchQuery(api.expenses.types.list, {}, { token }),
    preloadQuery(api.expenses.activities.list, { limit: 30 }, { token }),
  ]);

  return (
    <article className="doc">
      <h1>Expenses</h1>
      <ActivitiesHome types={types.map((t) => ({ id: t.id, name: t.name }))} preloaded={preloadedActivities} />
    </article>
  );
}
