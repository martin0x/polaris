import { Job } from "bullmq";
import { JobProcessor } from "@/systems/types";
import { getQueue } from "@/platform/jobs/queue";
import { computeActiveTopics } from "./computeActiveTopics";

export const computeActiveTopicsJob: JobProcessor = async (_job: Job) => {
  await computeActiveTopics();
};

const SCHEDULE_PATTERN = "0 23 * * *";
const REPEAT_KEY = "compute-active-topics-daily";

export async function registerSchedules(): Promise<void> {
  const queue = getQueue("journal-queue");
  await queue.add(
    "compute-active-topics",
    {},
    {
      repeat: { pattern: SCHEDULE_PATTERN, key: REPEAT_KEY },
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
}
