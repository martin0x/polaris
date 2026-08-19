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
  if (item.activityId !== activityId) {
    throw new ItemConflictError(itemId);
  }
  void recordActivityMetrics(activityId);
  return item;
}

export async function deleteItem(activityId: string, itemId: string): Promise<void> {
  // deleteMany so deleting an already-deleted item is a success (sync replays).
  await prisma.expenseItem.deleteMany({ where: { id: itemId, activityId } });
  void recordActivityMetrics(activityId);
}

/** Telemetry snapshot — intentionally fire-and-forget: a metrics failure must
 *  never fail or slow an item sync from a flaky in-store connection. */
async function recordActivityMetrics(activityId: string): Promise<void> {
  try {
    const agg = await prisma.expenseItem.aggregate({
      where: { activityId },
      _count: { _all: true },
      _sum: { amountCentavos: true },
    });
    await Promise.all([
      feedback.recordMetric("expenses", "items_per_activity", agg._count._all),
      feedback.recordMetric("expenses", "activity_total_centavos", agg._sum.amountCentavos ?? 0),
    ]);
  } catch (err) {
    console.error("expenses: metric recording failed", err);
  }
}
