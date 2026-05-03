import { NextRequest, NextResponse } from "next/server";
import { computeActiveTopics } from "@/systems/journal/services/computeActiveTopics";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await computeActiveTopics();
  return NextResponse.json({ ok: true });
}
