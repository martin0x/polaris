import type { PaletteLayer } from "@/platform/palette/types";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const activitiesLayer: PaletteLayer = {
  name: "activities",
  singular: "activity",
  async search(query, _parentId) {
    const token = await convexAuthNextjsToken();
    const rows = await fetchQuery(api.expenses.activities.search, { query }, { token });
    return rows.map((a) => ({
      id: a.id,
      label: a.title ?? a.typeName,
      sublabel: `${a.typeName} · ${DATE_FORMAT.format(new Date(a.startedAt))}`,
      icon: "receipt" as const,
      href: `/expenses/${a.id}`,
      drillable: false,
    }));
  },
};
