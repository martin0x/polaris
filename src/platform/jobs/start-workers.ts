import { manifests } from "@/systems";
import { registerSystemJobs, shutdownWorkers } from "./registry";
import { registerSchedules as registerJournalSchedules } from "@/systems/journal/services/jobs";

console.log("Starting workers...");
registerSystemJobs(manifests);

// Per-system schedule registration. Each system that needs cron jobs exports a
// `registerSchedules()` function that adds repeatable jobs to its queue.
await registerJournalSchedules();

console.log("Workers running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});
