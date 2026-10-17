"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";

interface StartButtonsProps {
  types: Array<{ id: string; name: string }>;
  onStarted?: (id: string) => void;
  onStartFailed?: () => void;
}

export function StartButtons({ types, onStarted, onStartFailed }: StartButtonsProps) {
  const router = useRouter();
  const startActivity = useMutation(api.expenses.activities.start);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(typeId: string) {
    setStartingId(typeId);
    setError(null);
    try {
      const id = await startActivity({ typeId: typeId as Id<"expenseActivityTypes"> });
      onStarted?.(id);
      router.push(`/expenses/${id}`);
      // Stay disabled while the route transition lands; unmount resets state.
    } catch {
      setError("Could not start the activity. Check your connection and try again.");
      onStartFailed?.();
      setStartingId(null);
    }
  }

  if (types.length === 0) {
    return (
      <p className="lead">
        No activity types yet. Add one on the types tab.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn btn-secondary"
            disabled={startingId !== null}
            onClick={() => start(t.id)}
          >
            {startingId === t.id ? "Starting…" : t.name}
          </button>
        ))}
      </div>
      {error ? (
        <p className="caption" style={{ color: "var(--danger)", marginTop: "var(--sp-2)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
