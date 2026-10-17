import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { getStorage } from "@/platform/storage";
import { unauthorized, badRequest } from "@/platform/api/errors";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedNextjs())) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;

  if (!file || !key) {
    return badRequest("Missing 'file' or 'key' in form data");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  await storage.upload(key, buffer, { contentType: file.type });

  return NextResponse.json({ key, size: buffer.length }, { status: 201 });
}
