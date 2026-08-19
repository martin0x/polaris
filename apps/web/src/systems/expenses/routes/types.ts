import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createTypeSchema, listTypesQuerySchema, updateTypeSchema } from "../schemas/expenses";
import {
  createType as createTypeService,
  listTypes as listTypesService,
  updateType as updateTypeService,
} from "../services/types";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const listTypes: RouteHandler = async (req) => {
  const parsed = listTypesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const types = await listTypesService({ includeArchived: parsed.archived });
  return NextResponse.json({ types });
};

export const createType: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createTypeSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid type", err.flatten());
    throw err;
  }
  try {
    const type = await createTypeService(parsed.name);
    return NextResponse.json({ type }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `Type "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const updateType: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateTypeSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  try {
    const type = await updateTypeService(params.id, parsed);
    return NextResponse.json({ type });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return notFound(`Type ${params.id} not found`);
      if (err.code === "P2002") return apiError(409, "A type with that name already exists");
    }
    throw err;
  }
};
