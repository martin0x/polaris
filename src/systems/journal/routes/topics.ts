import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createTopicSchema, listTopicsQuerySchema, updateTopicSchema } from "../schemas/topics";
import {
  archiveTopic,
  createTopic as createTopicService,
  getTopicById,
  listTopics as listTopicsService,
  renameTopic,
  unarchiveTopic,
  updateTopicDescription,
} from "../services/topics";
import { prisma } from "@/platform/db/client";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createTopic: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createTopicSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid topic", err.flatten());
    throw err;
  }
  try {
    const topic = await createTopicService(parsed);
    return NextResponse.json({ topic }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return apiError(409, `Topic "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const listTopics: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listTopicsQuerySchema.parse(search);
  const topics = await listTopicsService({ includeArchived: parsed.archived });
  return NextResponse.json({ topics });
};

export const getTopic: RouteHandler = async (_req, params) => {
  const topic = await getTopicById(params.id);
  if (!topic) return notFound(`Topic ${params.id} not found`);
  const entryCount = await prisma.journalEntry.count({
    where: { topicId: topic.id, deletedAt: null },
  });
  return NextResponse.json({ topic, entryCount });
};

export const updateTopic: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateTopicSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }

  const existing = await getTopicById(params.id);
  if (!existing) return notFound(`Topic ${params.id} not found`);

  let topic = existing;
  if (parsed.name !== undefined) topic = await renameTopic(topic.id, parsed.name);
  if (parsed.description !== undefined) {
    topic = await updateTopicDescription(topic.id, parsed.description);
  }
  if (parsed.archived !== undefined) {
    topic = parsed.archived ? await archiveTopic(topic.id) : await unarchiveTopic(topic.id);
  }

  return NextResponse.json({ topic });
};
