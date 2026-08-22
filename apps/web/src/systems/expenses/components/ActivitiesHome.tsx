"use client";

// Coordinates the start flow: while a just-started activity is navigating,
// its row is hidden so the list doesn't flash before the redirect lands.

import { useState } from "react";
import type { Preloaded } from "convex/react";
import type { api } from "@polaris/backend/convex/_generated/api";
import { ActivityList } from "./ActivityList";
import { StartButtons } from "./StartButtons";

export function ActivitiesHome({
  types,
  preloaded,
}: {
  types: Array<{ id: string; name: string }>;
  preloaded: Preloaded<typeof api.expenses.activities.list>;
}) {
  const [pendingStartId, setPendingStartId] = useState<string | null>(null);
  return (
    <>
      <StartButtons
        types={types}
        onStarted={setPendingStartId}
        onStartFailed={() => setPendingStartId(null)}
      />
      <ActivityList preloaded={preloaded} hideId={pendingStartId ?? undefined} />
    </>
  );
}
