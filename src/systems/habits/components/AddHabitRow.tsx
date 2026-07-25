"use client";

import { useEffect, useRef, useState } from "react";

interface AddHabitRowProps {
  autoFocus: boolean;
  onAdd: (name: string) => Promise<boolean>;
}

export function AddHabitRow({ autoFocus, onAdd }: AddHabitRowProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed);
    setBusy(false);
    if (added) setName("");
  };

  return (
    <div className="habit-add-row">
      <input
        ref={inputRef}
        className="habit-add-input"
        placeholder="Add a habit"
        aria-label="Add a habit"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
    </div>
  );
}
