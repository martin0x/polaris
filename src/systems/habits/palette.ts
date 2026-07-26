import type { PaletteLayer, PaletteResult } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";

export const habitsLayer: PaletteLayer = {
  name: "habits",
  singular: "habit",
  search: async (query) => {
    const trimmed = query.trim();
    const habits = await prisma.habit.findMany({
      where: {
        archived: false,
        ...(trimmed ? { name: { contains: trimmed, mode: "insensitive" as const } } : {}),
      },
      take: 10,
      orderBy: { position: "asc" },
    });
    const items: PaletteResult[] = habits.map((h) => ({
      id: h.id,
      label: h.name,
      icon: "repeat" as const,
      href: "/habits",
      drillable: false,
    }));
    if (!trimmed) {
      items.unshift(
        { id: "nav-tracker", label: "Tracker", icon: "repeat" as const, href: "/habits", drillable: false },
        { id: "nav-charts", label: "Charts", icon: "calendar" as const, href: "/habits/charts", drillable: false },
        { id: "add-habit", label: "Add habit", icon: "plus" as const, href: "/habits?new=1", drillable: false },
      );
    }
    return items;
  },
};
