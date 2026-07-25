import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { detailQuerySchema } from "../schemas/habits";
import { getHabitDetail } from "../services/detail";

export const getDetailRoute: RouteHandler = async (req, params) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = detailQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid week", err.flatten());
    throw err;
  }
  const detail = await getHabitDetail(params.id, parsed.week);
  if (!detail) return notFound(`Habit ${params.id} not found`);
  return NextResponse.json(detail);
};
