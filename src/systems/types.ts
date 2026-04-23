import { NextRequest, NextResponse } from "next/server";
import { Job } from "bullmq";

export type RouteHandler = (
  req: NextRequest,
  params: Record<string, string>
) => Promise<NextResponse>;

export type JobProcessor = (job: Job) => Promise<void>;

export interface SystemManifest {
  name: string;
  displayName: string;
  description: string;
  routes: Record<string, RouteHandler>;
  jobs: Record<string, JobProcessor>;
  nav: {
    label: string;
    icon: string;
    href: string;
  };
}
