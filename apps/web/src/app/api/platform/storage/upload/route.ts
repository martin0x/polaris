import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { getStorage } from "@/platform/storage";
import { unauthorized, badRequest } from "@/platform/api/errors";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

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
