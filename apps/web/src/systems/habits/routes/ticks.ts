import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { dateStringSchema, tickBodySchema, weekQuerySchema } from "../schemas/habits";
import { getHabitById } from "../services/habits";
import { FutureDateError, getWeek, removeTick, upsertTick } from "../services/ticks";

export const getWeekRoute: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = weekQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid week", err.flatten());
    throw err;
  }
  return NextResponse.json(await getWeek(parsed.start));
};

export const putTick: RouteHandler = async (req, params) => {
  let body;
  let date;
  try {
    body = tickBodySchema.parse(await req.json().catch(() => null));
    date = dateStringSchema.parse(params.date);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid tick", err.flatten());
    throw err;
  }
  const habit = await getHabitById(params.id);
  if (!habit) return notFound(`Habit ${params.id} not found`);
  try {
    const tick = await upsertTick(params.id, date, body.status);
    return NextResponse.json({ tick });
  } catch (err) {
    if (err instanceof FutureDateError) return badRequest(err.message);
    throw err;
  }
};

export const deleteTick: RouteHandler = async (_req, params) => {
  let date;
  try {
    date = dateStringSchema.parse(params.date);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid date", err.flatten());
    throw err;
  }
  await removeTick(params.id, date);
  return new NextResponse(null, { status: 204 });
};
