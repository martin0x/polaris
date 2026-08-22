"use client";

import { useEffect, useState } from "react";
import { useSyncStatusOptional } from "./SyncStatus";

// The TitleBar's sync state. Idle: the success dot. While mutations are in
// flight: a spinner that only ever stops on an animation-iteration boundary,
// so even a fast sync shows at least one full loop instead of a flicker. The
// pending changes are listed in a hover card.
export function SyncIndicator() {
  const sync = useSyncStatusOptional();
  const pending = sync?.pending ?? [];
  const [spinning, setSpinning] = useState(false);
  const [hover, setHover] = useState(false);

  // Render-phase adjustment (not an effect): start spinning the moment work appears.
  if (pending.length > 0 && !spinning) setSpinning(true);

  // Reduced motion and hidden tabs never fire animationiteration; a timer
  // fallback keeps the spinner state from sticking.
  useEffect(() => {
    if (!spinning || pending.length > 0) return;
    const t = setTimeout(() => setSpinning(false), 1000);
    return () => clearTimeout(t);
  }, [spinning, pending.length]);

  const syncing = pending.length > 0 || spinning;

  return (
    <span
      className="sync-status"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {syncing ? (
        <span
          className="sync-spinner"
          onAnimationIteration={() => {
            if (pending.length === 0) setSpinning(false);
          }}
        />
      ) : (
        <span className="sync-dot" />
      )}
      <span className="sync-label">
        {pending.length > 0 ? `${pending.length} unsynced` : syncing ? "syncing" : "synced"}
      </span>
      {hover && pending.length > 0 && (
        <span className="sync-popover" role="status">
          {pending.slice(0, 8).map((op) => (
            <span key={op.id} className="sync-popover-row">
              {op.label}
            </span>
          ))}
          {pending.length > 8 && (
            <span className="sync-popover-row">and {pending.length - 8} more</span>
          )}
        </span>
      )}
    </span>
  );
}
