import { NextRequest } from "next/server";
import { auth } from "@/platform/auth/config";
import { matchRoute } from "@/platform/api/router";
import { notFound, unauthorized } from "@/platform/api/errors";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";

const registry = createSystemRegistry(manifests);

async function handleRequest(
  req: NextRequest,
  { params }: { params: Promise<{ system: string; path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { system: systemName, path } = await params;
  const manifest = registry.get(systemName);
  if (!manifest) return notFound(`System "${systemName}" not found`);

  const method = req.method;
  for (const [pattern, handler] of Object.entries(manifest.routes)) {
    const routeParams = matchRoute(pattern, method, path);
    if (routeParams !== null) {
      return handler(req, routeParams);
    }
  }

  return notFound(`No route matches ${method} /${path.join("/")}`);
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
