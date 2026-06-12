import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";
import type { Prisma } from "@/generated/prisma/client";

export type ActivityWithDetails = Prisma.ExpenseActivityGetPayload<{
  include: { type: true; items: true };
}>;

export interface ActivitySummary {
  id: string;
  typeId: string;
  typeName: string;
  title: string | null;
  startedAt: Date;
  itemCount: number;
  totalCentavos: number;
}

export async function startActivity(input: { typeId: string; title?: string }) {
  const activity = await prisma.expenseActivity.create({
    data: { typeId: input.typeId, title: input.title ?? null },
    include: { type: true },
  });
  await feedback.recordMetric("expenses", "activity_started", 1);
  return activity;
}

export async function listActivities(opts: {
  typeId?: string;
  cursor?: string;
  limit: number;
}): Promise<{ activities: ActivitySummary[]; nextCursor: string | null }> {
  const rows = await prisma.expenseActivity.findMany({
    where: opts.typeId ? { typeId: opts.typeId } : {},
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { type: true, items: { select: { amountCentavos: true } } },
  });
  const page = rows.slice(0, opts.limit);
  return {
    activities: page.map((a) => ({
      id: a.id,
      typeId: a.typeId,
      typeName: a.type.name,
      title: a.title,
      startedAt: a.startedAt,
      itemCount: a.items.length,
      totalCentavos: a.items.reduce((sum, i) => sum + i.amountCentavos, 0),
    })),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}

export async function getActivityWithItems(id: string): Promise<ActivityWithDetails | null> {
  return prisma.expenseActivity.findUnique({
    where: { id },
    include: { type: true, items: { orderBy: { position: "asc" } } },
  });
}

export async function updateActivity(
  id: string,
  input: { title?: string | null; typeId?: string }
) {
  return prisma.expenseActivity.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title || null } : {}),
      ...(input.typeId !== undefined ? { typeId: input.typeId } : {}),
    },
    include: { type: true },
  });
}

export async function deleteActivity(id: string): Promise<void> {
  await prisma.expenseActivity.delete({ where: { id } });
}
