"use client";

import { useEffect, useState } from "react";

export interface PickerTopic {
  id: string;
  name: string;
}

interface TopicPickerProps {
  selected: PickerTopic | null;
  onSelect: (topic: PickerTopic) => void;
}

export function TopicPicker({ selected, onSelect }: TopicPickerProps) {
  const [topics, setTopics] = useState<PickerTopic[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/systems/journal/topics")
      .then((r) => r.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => setTopics([]));
  }, []);

  async function handleCreate(name: string) {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/systems/journal/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? "Could not create topic");
      }
      const { topic } = await res.json();
      setTopics((prev) => [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)));
      onSelect(topic);
      setOpen(false);
      setCreating("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
      >
        {selected ? selected.name : "Pick topic"}
      </button>
      {open ? (
        <div
          className="paper-card"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 10,
            minWidth: 220,
            padding: 6,
          }}
          role="listbox"
        >
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              className="sb-item"
              style={{ width: "100%", justifyContent: "flex-start" }}
              onClick={() => {
                onSelect(t);
                setOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
            <input
              type="text"
              value={creating}
              onChange={(e) => setCreating(e.target.value)}
              placeholder="New topic…"
              style={{
                width: "100%",
                background: "var(--paper-0)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "4px 8px",
                fontSize: 13,
                color: "var(--fg)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate(creating);
                }
              }}
              disabled={busy}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
