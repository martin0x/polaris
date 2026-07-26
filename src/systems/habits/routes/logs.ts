import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { feedback } from "@/platform/feedback";
import { RouteHandler } from "@/systems/types";
import { entryWordCount } from "@/systems/journal/services/entries";
import { createLogSchema } from "../schemas/habits";
import { getHabitById } from "../services/habits";
import { createLog, TopicArchivedError, TopicMissingError } from "../services/logs";
import { FutureDateError } from "../services/ticks";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createLogRoute: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createLogSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid log", err.flatten());
    throw err;
  }
  const existing = await getHabitById(params.id);
  if (!existing) return notFound(`Habit ${params.id} not found`);
  try {
    const entry = await createLog(params.id, parsed.date, {
      title: parsed.title ?? null,
      body: parsed.body,
    });
    // Habit logs are journal entries — keep the journal's usage metrics honest.
    await Promise.allSettled([
      feedback.recordMetric("journal", "entry_created", 1),
      feedback.recordMetric("journal", "words_per_entry", entryWordCount(parsed.body)),
    ]);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof FutureDateError) {
      return badRequest("Logs can't be written for future days.");
    }
    if (err instanceof TopicArchivedError || err instanceof TopicMissingError) {
      return apiError(409, err.message);
    }
    throw err;
  }
};
