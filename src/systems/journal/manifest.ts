import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as entries from "./routes/entries";
import * as topics from "./routes/topics";
import * as tags from "./routes/tags";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {
    "GET /entries":        entries.listEntries,
    "POST /entries":       entries.createEntry,
    "GET /entries/:id":    entries.getEntry,
    "PATCH /entries/:id":  entries.updateEntry,
    "DELETE /entries/:id": entries.deleteEntry,
    "GET /topics":         topics.listTopics,
    "POST /topics":        topics.createTopic,
    "GET /topics/:id":     topics.getTopic,
    "PATCH /topics/:id":   topics.updateTopic,
    "GET /tags":           tags.listTags,
  },

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },

  palette: {
    layers: [palette.topicsLayer, palette.notesLayer],
  },
};
