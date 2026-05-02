import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { unauthorized, badRequest } from "@/platform/api/errors";
import { manifests } from "@/systems";
import { buildPaletteRegistry } from "@/platform/palette/registry";
import { resolveQuery } from "@/platform/palette/resolver";
import type { PaletteScope } from "@/platform/palette/types";

const registry = buildPaletteRegistry(manifests);

function isScope(value: unknown): value is PaletteScope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.systemName === "string" &&
    typeof v.layerIndex === "number" &&
    (v.parentId === null || typeof v.parentId === "string")
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { query?: unknown }).query !== "string"
  ) {
    return badRequest("query (string) is required");
  }

  const scope = isScope((body as { scope?: unknown }).scope)
    ? (body as { scope: PaletteScope }).scope
    : undefined;

  const result = await resolveQuery(registry, {
    query: (body as { query: string }).query,
    scope,
  });
  return NextResponse.json(result);
}
