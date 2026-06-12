"use client";

import { usePathname } from "next/navigation";

/** Breadcrumb label for the active system. Layouts are server components
 *  without pathname access, so this tiny client island maps the first path
 *  segment against the registry's nav items passed down as a prop. */
export function SystemCrumb({
  systems,
}: {
  systems: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const segment = `/${pathname.split("/")[1] ?? ""}`;
  const match = systems.find((s) => s.href === segment);
  return <>{match?.label ?? null}</>;
}
