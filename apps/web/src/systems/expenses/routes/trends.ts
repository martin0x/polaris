import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { trendsQuerySchema } from "../schemas/expenses";
import { getTrends as getTrendsService } from "../services/trends";

export const getTrends: RouteHandler = async (req) => {
  let parsed;
  try {
    parsed = trendsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid trends query", err.flatten());
    throw err;
  }
  const trends = await getTrendsService(parsed.months);
  return NextResponse.json(trends);
};
