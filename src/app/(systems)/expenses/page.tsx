import { listTypes } from "@/systems/expenses/services/types";
import { listActivities } from "@/systems/expenses/services/activities";
import { StartButtons } from "@/systems/expenses/components/StartButtons";
import { ActivityList } from "@/systems/expenses/components/ActivityList";

export default async function ExpensesPage() {
  const [types, { activities }] = await Promise.all([
    listTypes({}),
    listActivities({ limit: 30 }),
  ]);

  return (
    <article className="doc">
      <h1>Expenses</h1>
      <p className="overline" style={{ marginTop: "var(--sp-4)" }}>Start an activity</p>
      <StartButtons types={types.map((t) => ({ id: t.id, name: t.name }))} />
      <p className="overline" style={{ marginTop: "var(--sp-8)" }}>Recent</p>
      <ActivityList
        activities={activities.map((a) => ({
          id: a.id,
          typeName: a.typeName,
          title: a.title,
          startedAt: a.startedAt.toISOString(),
          itemCount: a.itemCount,
          totalCentavos: a.totalCentavos,
        }))}
      />
    </article>
  );
}
