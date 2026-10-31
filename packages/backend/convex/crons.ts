import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 15:00 UTC = 23:00 Manila, so each daily sample closes out the Manila day
// (docs/replatform.md §05 Phase 3). Harmless retime from the old 23:00 UTC
// Vercel cron: the job reads a rolling 7-day window.
crons.daily(
  "journal active topics",
  { hourUTC: 15, minuteUTC: 0 },
  internal.journal.activeTopics.compute,
  {}
);

export default crons;
