import { SystemManifest } from "../types";
import * as palette from "./palette";

export const manifest: SystemManifest = {
  name: "expenses",
  displayName: "Activity Expenses",
  description: "Track what an activity costs while it happens",

  nav: {
    label: "Expenses",
    icon: "receipt",
    href: "/expenses",
  },

  palette: {
    layers: [palette.activitiesLayer],
  },
};
