import { notFound } from "next/navigation";
import { getActivityWithItems } from "@/systems/expenses/services/activities";
import { CapturePage } from "@/systems/expenses/components/CapturePage";

export default async function ExpenseActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activity = await getActivityWithItems(id);
  if (!activity) notFound();

  return (
    <CapturePage
      activity={{
        id: activity.id,
        title: activity.title,
        typeName: activity.type.name,
        startedAt: activity.startedAt.toISOString(),
      }}
      initialItems={activity.items.map((i) => ({
        id: i.id,
        name: i.name,
        amountCentavos: i.amountCentavos,
        position: i.position,
      }))}
    />
  );
}
