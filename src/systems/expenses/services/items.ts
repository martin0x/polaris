import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";
import type { ExpenseItem } from "@/generated/prisma/client";

/** A PUT replayed an id that exists under a different activity — client ids
 *  are scoped to one activity, so this is a 409, not an upsert. */
export class ItemConflictError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} belongs to a different activity`);
    this.name = "ItemConflictError";
  }
}

export interface PutItemInput {
  name: string;
  amountCentavos: number;
  position: number;
}

export async function upsertItem(
  activityId: string,
  itemId: string,
  input: PutItemInput
): Promise<ExpenseItem> {
  const existing = await prisma.expenseItem.findUnique({ where: { id: itemId } });
  if (existing && existing.activityId !== activityId) {
    throw new ItemConflictError(itemId);
  }
  const item = await prisma.expenseItem.upsert({
    where: { id: itemId },
    create: { id: itemId, activityId, ...input },
    update: {
      name: input.name,
      amountCentavos: input.amountCentavos,
      position: input.position,
    },
  });
  await recordActivityMetrics(activityId);
  return item;
}

export async function deleteItem(activityId: string, itemId: string): Promise<void> {
  // deleteMany so deleting an already-deleted item is a success (sync replays).
  await prisma.expenseItem.deleteMany({ where: { id: itemId, activityId } });
  await recordActivityMetrics(activityId);
}

async function recordActivityMetrics(activityId: string): Promise<void> {
  const agg = await prisma.expenseItem.aggregate({
    where: { activityId },
    _count: { _all: true },
    _sum: { amountCentavos: true },
  });
  await feedback.recordMetric("expenses", "items_per_activity", agg._count._all);
  await feedback.recordMetric("expenses", "activity_total_centavos", agg._sum.amountCentavos ?? 0);
}
