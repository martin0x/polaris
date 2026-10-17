import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { feedback } from "@/platform/feedback";
import { RouteHandler } from "@/systems/types";
import {
  createEntrySchema,
  listEntriesQuerySchema,
  updateEntrySchema,
} from "../schemas/entries";
import {
  createEntry as createEntryService,
  entryWordCount,
  getEntry as getEntryService,
  listEntries as listEntriesService,
  softDeleteEntry,
  updateEntry as updateEntryService,
} from "../services/entries";
import { searchEntries } from "../services/search";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function recordEntryMetrics(body: string) {
  await Promise.allSettled([
    feedback.recordMetric("journal", "entry_created", 1),
    feedback.recordMetric("journal", "words_per_entry", entryWordCount(body)),
  ]);
}

async function recordWordsMetric(body: string) {
  await feedback
    .recordMetric("journal", "words_per_entry", entryWordCount(body))
    .catch(() => {});
}

export const createEntry: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createEntrySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid entry body", err.flatten());
    }
    throw err;
  }
  const entry = await createEntryService(parsed);
  await recordEntryMetrics(entry.body);
  return NextResponse.json({ entry }, { status: 201 });
};

export const updateEntry: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateEntrySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid entry update", err.flatten());
    }
    throw err;
  }

  const existing = await getEntryService(params.id);
  if (!existing) return notFound(`Entry ${params.id} not found`);

  const updated = await updateEntryService(params.id, parsed);
  if (parsed.body !== undefined) await recordWordsMetric(updated.body);
  return NextResponse.json({ entry: updated });
};

export const deleteEntry: RouteHandler = async (_req, params) => {
  await softDeleteEntry(params.id);
  return new NextResponse(null, { status: 204 });
};

export const getEntry: RouteHandler = async (_req, params) => {
  const entry = await getEntryService(params.id);
  if (!entry) return notFound(`Entry ${params.id} not found`);
  return NextResponse.json({ entry });
};

export const listEntries: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = listEntriesQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid query", err.flatten());
    }
    throw err;
  }

  if (parsed.q && parsed.q.trim().length > 0) {
    const entries = await searchEntries({
      q: parsed.q,
      topicId: parsed.topicId,
      limit: parsed.limit,
    });
    return NextResponse.json({ entries });
  }

  const entries = await listEntriesService({
    topicId: parsed.topicId,
    tag: parsed.tag,
    cursor: parsed.cursor,
    limit: parsed.limit,
  });
  return NextResponse.json({ entries });
};
