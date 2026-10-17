"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@polaris/backend/convex/_generated/api";
import { EntryCard } from "./EntryCard";

/** A live list of journal entries — Today, one topic, or one tag. Writes from
 *  anywhere (compose box, edits, deletes, task ticks) appear without a refresh. */
export function EntryFeed({
  preloaded,
  emptyText,
  showCount = false,
  spaceAbove = false,
}: {
  preloaded: Preloaded<typeof api.journal.entries.list>;
  emptyText: string;
  /** Tag pages: an "N entries" caption above the list. */
  showCount?: boolean;
  /** Pages with a compose box above the feed. */
  spaceAbove?: boolean;
}) {
  const { entries } = usePreloadedQuery(preloaded);
  return (
    <>
      {showCount ? (
        <p className="caption" style={{ marginTop: -8 }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
          ...(spaceAbove ? { marginTop: "var(--sp-6)" } : {}),
        }}
      >
        {entries.length === 0 ? (
          <p className="lead">{emptyText}</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </>
  );
}
