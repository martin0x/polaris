import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as types from "./routes/types";
import * as activities from "./routes/activities";
import * as trends from "./routes/trends";

export const manifest: SystemManifest = {
  name: "expenses",
  displayName: "Activity Expenses",
  description: "Track what an activity costs while it happens",

  routes: {
    "GET /types":                           types.listTypes,
    "POST /types":                          types.createType,
    "PATCH /types/:id":                     types.updateType,
    "GET /activities":                      activities.listActivities,
    "POST /activities":                     activities.createActivity,
    "GET /activities/:id":                  activities.getActivity,
    "PATCH /activities/:id":                activities.updateActivity,
    "DELETE /activities/:id":               activities.deleteActivity,
    "PUT /activities/:id/items/:itemId":    activities.putItem,
    "DELETE /activities/:id/items/:itemId": activities.deleteItem,
    "GET /trends":                          trends.getTrends,
  },

  nav: {
    label: "Expenses",
    icon: "receipt",
    href: "/expenses",
  },

  palette: {
    layers: [palette.activitiesLayer],
  },
};
