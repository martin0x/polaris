import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createHabitSchema, reorderSchema, updateHabitSchema } from "../schemas/habits";
import {
  archiveHabit, createHabit as createHabitService, getHabitById, recreateTopic,
  renameHabit, reorderHabits, setQuote, TopicNameCollisionError, unarchiveHabit,
} from "../services/habits";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createHabit: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createHabitSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid habit", err.flatten());
    throw err;
  }
  try {
    const habit = await createHabitService(parsed.name);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `A habit named "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const updateHabit: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateHabitSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  const existing = await getHabitById(params.id);
  if (!existing) return notFound(`Habit ${params.id} not found`);
  try {
    let habit = existing;
    if (parsed.name !== undefined && parsed.name !== habit.name) {
      habit = await renameHabit(habit.id, parsed.name);
    }
    if (parsed.quote !== undefined) {
      habit = await setQuote(habit.id, parsed.quote === "" ? null : parsed.quote);
    }
    return NextResponse.json({ habit });
  } catch (err) {
    if (err instanceof TopicNameCollisionError) return apiError(409, err.message);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `A habit named "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const reorderRoute: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = reorderSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid order", err.flatten());
    throw err;
  }
  try {
    await reorderHabits(parsed.ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "reorder list mismatch") {
      return badRequest("Order list must contain every unarchived habit exactly once");
    }
    throw err;
  }
};

function archiveHandler(fn: (id: string) => Promise<unknown>): RouteHandler {
  return async (_req, params) => {
    const existing = await getHabitById(params.id);
    if (!existing) return notFound(`Habit ${params.id} not found`);
    const habit = await fn(params.id);
    return NextResponse.json({ habit });
  };
}

export const archiveRoute = archiveHandler(archiveHabit);
export const unarchiveRoute = archiveHandler(unarchiveHabit);
export const recreateTopicRoute = archiveHandler(recreateTopic);
