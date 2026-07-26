"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";

interface AddHabitFormProps {
  startOpen: boolean;
  onAdd: (name: string, quote: string) => Promise<boolean>;
}

export function AddHabitForm({ startOpen, onAdd }: AddHabitFormProps) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState("");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const cancel = () => {
    setOpen(false);
    setName("");
    setQuote("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed, quote.trim());
    setBusy(false);
    if (added) cancel();
  };

  if (!open) {
    return (
      <div className="habit-add">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Add habit
        </button>
      </div>
    );
  }

  return (
    <form
      className="habit-add-form"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) cancel(); }}
    >
      <input
        ref={nameRef}
        className="habit-add-input"
        placeholder="Habit name"
        aria-label="Habit name"
        required
        aria-required="true"
        maxLength={80}
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="habit-quote-input"
        placeholder="Quote, goal, or tip (optional)"
        aria-label="Quote, goal, or tip (optional)"
        rows={2}
        maxLength={500}
        value={quote}
        disabled={busy}
        onChange={(e) => setQuote(e.target.value)}
      />
      <div className="habit-add-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          Add habit
        </button>
        <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
