import { Job, Worker } from "bullmq";
import { SystemManifest } from "@/systems/types";
import { getQueue } from "./queue";
import { createWorker } from "./worker";

const workers: Worker[] = [];

export function registerSystemJobs(manifests: SystemManifest[]) {
  for (const manifest of manifests) {
    if (Object.keys(manifest.jobs).length === 0) continue;

    const queueName = `${manifest.name}-queue`;
    getQueue(queueName);

    const jobProcessors = manifest.jobs;
    const worker = createWorker(queueName, async (job: Job) => {
      const processor = jobProcessors[job.name];
      if (!processor) {
        throw new Error(
          `No processor for job "${job.name}" in system "${manifest.name}"`
        );
      }
      await processor(job);
    });

    workers.push(worker);
    console.log(
      `Registered jobs for ${manifest.name}: ${Object.keys(manifest.jobs).join(", ")}`
    );
  }
}

export function getWorkers(): Worker[] {
  return workers;
}

export async function shutdownWorkers() {
  await Promise.all(workers.map((w) => w.close()));
}
