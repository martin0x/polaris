"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toggleTaskAtLine } from "../lib/tasks";

interface TaskCheckboxProps {
  entryId: string;
  lineNumber: number;
  initiallyChecked: boolean;
  body: string;
  children: ReactNode;
}

export function TaskCheckbox({
  entryId,
  lineNumber,
  initiallyChecked,
  body,
  children,
}: TaskCheckboxProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(initiallyChecked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (busy) return;
    const next = !checked;
    setChecked(next);
    setBusy(true);
    setError(null);

    try {
      const nextBody = toggleTaskAtLine(body, lineNumber);
      const res = await fetch(`/api/systems/journal/entries/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: nextBody }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        setChecked(!next);
        setError(`Save failed (${res.status}): ${detail.slice(0, 120) || res.statusText}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setChecked(!next);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="task-item" data-checked={checked ? "true" : "false"}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        disabled={busy}
        aria-label="Toggle task"
      />
      <span className="task-label">{children}</span>
      {error ? <span className="task-error">{error}</span> : null}
    </li>
  );
}
