import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const activitiesLayer: PaletteLayer = {
  name: "activities",
  singular: "activity",
  search: async (query, _parentId) => {
    const trimmed = query.trim();
    const activities = await prisma.expenseActivity.findMany({
      where: trimmed
        ? {
            OR: [
              { title: { contains: trimmed, mode: "insensitive" as const } },
              { type: { name: { contains: trimmed, mode: "insensitive" as const } } },
            ],
          }
        : {},
      take: 10,
      orderBy: { startedAt: "desc" },
      include: { type: true },
    });
    return activities.map((a) => ({
      id: a.id,
      label: a.title ?? a.type.name,
      sublabel: `${a.type.name} · ${DATE_FORMAT.format(a.startedAt)}`,
      icon: "receipt" as const,
      href: `/expenses/${a.id}`,
      drillable: false,
    }));
  },
};
