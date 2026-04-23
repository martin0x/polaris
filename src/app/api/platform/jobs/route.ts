import { NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { unauthorized } from "@/platform/api/errors";
import { getAllQueues } from "@/platform/jobs/queue";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const queues = getAllQueues();
  const status: Record<string, unknown> = {};

  for (const [name, queue] of queues) {
    const counts = await queue.getJobCounts();
    status[name] = counts;
  }

  return NextResponse.json({ queues: status });
}
