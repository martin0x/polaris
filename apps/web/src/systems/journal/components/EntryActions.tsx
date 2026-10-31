"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { Icon } from "@/app/_components/Icon";

interface EntryActionsProps {
  entryId: Id<"journalEntries">;
  onEdit: () => void;
}

export function EntryActions({ entryId, onEdit }: EntryActionsProps) {
  const removeEntry = useMutation(api.journal.entries.remove);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this entry? It moves to trash.")) return;
    setBusy(true);
    try {
      await removeEntry({ id: entryId });
    } catch {
      window.alert("Could not delete the entry. Try again.");
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
