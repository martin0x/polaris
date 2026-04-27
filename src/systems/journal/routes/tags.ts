import { NextResponse } from "next/server";
import { RouteHandler } from "@/systems/types";
import { listTags as listTagsService } from "../services/topics";

export const listTags: RouteHandler = async () => {
  const tags = await listTagsService();
  return NextResponse.json({ tags });
};
