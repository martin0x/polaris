import { Worker, Job, Processor } from "bullmq";
import { getRedisConnection } from "./connection";

export function createWorker(
  queueName: string,
  processor: Processor
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: getRedisConnection(),
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(
      `[${queueName}] Job ${job?.id} failed: ${err.message}`
    );
  });

  worker.on("completed", (job: Job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  return worker;
}
