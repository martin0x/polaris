import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as habits from "./routes/habits";
import * as ticks from "./routes/ticks";
import * as detail from "./routes/detail";
import * as logs from "./routes/logs";

export const manifest: SystemManifest = {
  name: "habits",
  displayName: "Habit Tracker",
  description: "Weekly habit tracking with three-state ticks and journal-backed logs",

  routes: {
    "GET /week":                        ticks.getWeekRoute,
    "POST /habits":                     habits.createHabit,
    "PATCH /reorder":                   habits.reorderRoute,
    "PATCH /habits/:id":                habits.updateHabit,
    "POST /habits/:id/archive":         habits.archiveRoute,
    "POST /habits/:id/unarchive":       habits.unarchiveRoute,
    "POST /habits/:id/recreate-topic":  habits.recreateTopicRoute,
    "POST /habits/:id/logs":            logs.createLogRoute,
    "GET /habits/:id/detail":           detail.getDetailRoute,
    "PUT /habits/:id/ticks/:date":      ticks.putTick,
    "DELETE /habits/:id/ticks/:date":   ticks.deleteTick,
  },

  nav: {
    label: "Habits",
    icon: "repeat",
    href: "/habits",
  },

  palette: {
    layers: [palette.habitsLayer],
  },
};
