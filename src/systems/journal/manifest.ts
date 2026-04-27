import { SystemManifest } from "../types";
import * as palette from "./palette";

// Routes and jobs are wired in subsequent tasks. The empty maps are deliberate:
// they let the system register its nav and palette block with the platform
// before the route handlers exist.
export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {},
  jobs: {},

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },
};

// The platform's `SystemManifest` contract does not yet include `palette`. The
// Global Command Palette spec extends it. Until that spec ships we attach the
// block via a non-typed assignment so the manifest still typechecks.
(manifest as SystemManifest & { palette: { layers: unknown[] } }).palette = {
  layers: [palette.topicsLayer, palette.notesLayer],
};
