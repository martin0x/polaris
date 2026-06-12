import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import {
  createActivitySchema,
  listActivitiesQuerySchema,
  putItemSchema,
  updateActivitySchema,
} from "../schemas/expenses";
import {
  deleteActivity as deleteActivityService,
  getActivityWithItems,
  listActivities as listActivitiesService,
  startActivity,
  updateActivity as updateActivityService,
} from "../services/activities";
import { ItemConflictError, deleteItem as deleteItemService, upsertItem } from "../services/items";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const listActivities: RouteHandler = async (req) => {
  const parsed = listActivitiesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const result = await listActivitiesService(parsed);
  return NextResponse.json(result);
};

export const createActivity: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createActivitySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid activity", err.flatten());
    throw err;
  }
  try {
    const activity = await startActivity(parsed);
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return badRequest(`Unknown type ${parsed.typeId}`);
    }
    throw err;
  }
};

export const getActivity: RouteHandler = async (_req, params) => {
  const activity = await getActivityWithItems(params.id);
  if (!activity) return notFound(`Activity ${params.id} not found`);
  return NextResponse.json({ activity });
};

export const updateActivity: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateActivitySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  try {
    const activity = await updateActivityService(params.id, parsed);
    return NextResponse.json({ activity });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return notFound(`Activity ${params.id} not found`);
    }
    throw err;
  }
};

export const deleteActivity: RouteHandler = async (_req, params) => {
  try {
    await deleteActivityService(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return notFound(`Activity ${params.id} not found`);
    }
    throw err;
  }
};

export const putItem: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = putItemSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid item", err.flatten());
    throw err;
  }
  const activity = await getActivityWithItems(params.id);
  if (!activity) return notFound(`Activity ${params.id} not found`);
  try {
    const item = await upsertItem(params.id, params.itemId, parsed);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof ItemConflictError) return apiError(409, err.message);
    throw err;
  }
};

export const deleteItem: RouteHandler = async (_req, params) => {
  await deleteItemService(params.id, params.itemId);
  return new NextResponse(null, { status: 204 });
};
