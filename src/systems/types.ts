import { NextRequest, NextResponse } from "next/server";
import type { ComponentType } from "react";
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

/** A system's presence on the dashboard. Declared in the system's
 *  dashboard.tsx and registered in systems/dashboards.ts — kept out of the
 *  manifest so API route bundles never import React components. */
export interface SystemDashboard {
  name: string;
  /** One short lowercase fragment for the dashboard's daily line
   *  ("2 entries today"), or null to stay out of it. */
  summary: () => Promise<string | null>;
  /** Async server component rendering the system's day-start card. */
  Widget: ComponentType;
}
