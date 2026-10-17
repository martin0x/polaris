"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";

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
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    fetch("/api/systems/journal/topics")
      .then((r) => r.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => setTopics([]));
  }, []);

  // Focus the search field whenever the popover opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on click outside the picker.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? topics.filter((t) => t.name.toLowerCase().includes(q))
    : topics;
  const hasExact = topics.some((t) => t.name.toLowerCase() === q);
  const showCreate = q.length > 0 && !hasExact;
  // The create row, when present, sits just past the last filtered topic.
  const optionCount = filtered.length + (showCreate ? 1 : 0);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setError(null);
  }

  function pick(topic: PickerTopic) {
    onSelect(topic);
    close();
  }

  async function handleCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/systems/journal/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.error ?? "Could not create topic.");
        return;
      }
      const { topic } = await res.json();
      setTopics((prev) =>
        [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      pick(topic);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(optionCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex < filtered.length) {
        pick(filtered[activeIndex]);
      } else if (showCreate) {
        void handleCreate(query);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
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
            minWidth: 240,
            padding: 6,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              optionCount > 0 ? `${listId}-opt-${activeIndex}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setError(null);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search or add a topic…"
            disabled={busy}
            style={{
              width: "100%",
              background: "var(--paper-0)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: "5px 8px",
              fontSize: 13,
              color: "var(--fg)",
            }}
          />
          <div
            id={listId}
            role="listbox"
            style={{ maxHeight: 240, overflowY: "auto", marginTop: 4 }}
          >
            {filtered.length === 0 && !showCreate ? (
              <div
                className="caption"
                style={{ padding: "6px 8px", color: "var(--ink-4)" }}
              >
                {topics.length === 0 ? "No topics yet." : "No matching topics."}
              </div>
            ) : null}

            {filtered.map((t, i) => (
              <button
                key={t.id}
                id={`${listId}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className="sb-item"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  background: i === activeIndex ? "var(--bg-hover)" : undefined,
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(t)}
              >
                <span className="sb-label">{t.name}</span>
                {selected?.id === t.id ? (
                  <span style={{ marginLeft: "auto", color: "var(--accent)" }}>
                    <Icon name="check" size={14} />
                  </span>
                ) : null}
              </button>
            ))}

            {showCreate ? (
              <button
                id={`${listId}-opt-${filtered.length}`}
                type="button"
                role="option"
                aria-selected={activeIndex === filtered.length}
                className="sb-item"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  gap: 8,
                  background:
                    activeIndex === filtered.length
                      ? "var(--bg-hover)"
                      : undefined,
                }}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onClick={() => void handleCreate(query)}
                disabled={busy}
              >
                <Icon name="plus" size={14} />
                <span className="sb-label">Create “{query.trim()}”</span>
              </button>
            ) : null}
          </div>

          {error ? (
            <div
              className="caption"
              style={{ padding: "4px 8px 2px", color: "var(--danger)" }}
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
