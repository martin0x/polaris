import { NextResponse } from "next/server";

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function notFound(message = "Not found") {
  return apiError(404, message);
}

export function unauthorized(message = "Unauthorized") {
  return apiError(401, message);
}

export function badRequest(message = "Bad request", details?: unknown) {
  return apiError(400, message, details);
}
