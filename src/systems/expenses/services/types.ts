import { prisma } from "@/platform/db/client";
import type { ExpenseActivityType } from "@/generated/prisma/client";

export async function createType(name: string): Promise<ExpenseActivityType> {
  const max = await prisma.expenseActivityType.aggregate({ _max: { position: true } });
  return prisma.expenseActivityType.create({
    data: { name, position: (max._max.position ?? -1) + 1 },
  });
}

export async function listTypes(opts: {
  includeArchived?: boolean;
}): Promise<ExpenseActivityType[]> {
  return prisma.expenseActivityType.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    // Secondary key keeps ordering stable if positions ever tie
    // (e.g. an interrupted reorder swap).
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getTypeById(id: string): Promise<ExpenseActivityType | null> {
  return prisma.expenseActivityType.findUnique({ where: { id } });
}

export interface UpdateTypeInput {
  name?: string;
  archived?: boolean;
  position?: number;
}

export async function updateType(
  id: string,
  input: UpdateTypeInput
): Promise<ExpenseActivityType> {
  return prisma.expenseActivityType.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.archived !== undefined
        ? { archived: input.archived, archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });
}
