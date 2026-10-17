"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { toggleTaskAtLine } from "@polaris/core/tasks";

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
  const updateEntry = useMutation(api.journal.entries.update);
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
      await updateEntry({
        id: entryId as Id<"journalEntries">,
        body: toggleTaskAtLine(body, lineNumber),
      });
    } catch (err) {
      setChecked(!next);
      const msg =
        err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err);
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
