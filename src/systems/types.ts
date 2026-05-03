import { NextRequest, NextResponse } from "next/server";
import type { PaletteSystemConfig } from "@/platform/palette/types";

export type RouteHandler = (
  req: NextRequest,
  params: Record<string, string>
) => Promise<NextResponse>;

export interface SystemManifest {
  name: string;
  displayName: string;
  description: string;
  routes: Record<string, RouteHandler>;
  nav: {
    label: string;
    icon: string;
    href: string;
  };
  palette?: PaletteSystemConfig;
}
