"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StartButtonsProps {
  types: Array<{ id: string; name: string }>;
}

export function StartButtons({ types }: StartButtonsProps) {
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(typeId: string) {
    setStartingId(typeId);
    setError(null);
    try {
      const res = await fetch("/api/systems/expenses/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { activity } = await res.json();
      router.push(`/expenses/${activity.id}`);
    } catch {
      setError("Could not start the activity. Check your connection and try again.");
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
