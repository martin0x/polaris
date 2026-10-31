import { SystemManifest } from "../types";
import * as palette from "./palette";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },

  palette: {
    layers: [palette.topicsLayer, palette.notesLayer],
  },
};
