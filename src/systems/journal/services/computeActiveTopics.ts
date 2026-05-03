import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";

export async function computeActiveTopics(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } },
  });
  await feedback.recordMetric("journal", "active_topic_count", result.length);
}
