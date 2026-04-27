"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

interface EntryActionsProps {
  entryId: string;
  onEdit: () => void;
}

export function EntryActions({ entryId, onEdit }: EntryActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this entry? It moves to trash.")) return;
    setBusy(true);
    try {
      await fetch(`/api/systems/journal/entries/${entryId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions" aria-label="Entry actions">
      <button type="button" onClick={onEdit} aria-label="Edit entry">
        <Icon name="edit-3" size={14} />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Delete entry"
        disabled={busy}
      >
        <Icon name="trash-2" size={14} />
      </button>
    </div>
  );
}
