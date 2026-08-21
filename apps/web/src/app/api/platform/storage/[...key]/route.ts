import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { getStorage } from "@/platform/storage";
import { unauthorized, notFound } from "@/platform/api/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (!(await isAuthenticatedNextjs())) return unauthorized();

  const { key } = await params;
  const fullKey = key.join("/");
  const storage = getStorage();

  try {
    const data = await storage.download(fullKey);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch {
    return notFound(`File not found: ${fullKey}`);
  }
}
