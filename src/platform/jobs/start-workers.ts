import { manifests } from "@/systems";
import { registerSystemJobs, shutdownWorkers } from "./registry";

console.log("Starting workers...");
registerSystemJobs(manifests);
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
