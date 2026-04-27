"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

interface TopicHeaderActionsProps {
  topic: { id: string; name: string; archived: boolean };
}

export function TopicHeaderActions({ topic }: TopicHeaderActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRename() {
    const next = window.prompt("New name", topic.name);
    if (!next || next === topic.name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/systems/journal/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        window.alert("Could not rename. Pick a name that isn't already in use.");
        return;
      }
      router.replace(`/journal/topics/${encodeURIComponent(next)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm(`Archive "${topic.name}"? It moves out of the active list.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/systems/journal/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      router.push("/journal/topics");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
      <button type="button" className="btn btn-ghost" onClick={handleRename} disabled={busy}>
        <Icon name="edit-3" size={14} /> Rename
      </button>
      <button type="button" className="btn btn-ghost" onClick={handleArchive} disabled={busy}>
        <Icon name="archive" size={14} /> Archive
      </button>
    </div>
  );
}
