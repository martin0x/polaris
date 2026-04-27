"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { JournalEditor } from "./Editor";
import { TopicPicker, type PickerTopic } from "./TopicPicker";

const LAST_TOPIC_KEY = "journal:lastTopic";

interface ComposeBoxProps {
  defaultTopic?: PickerTopic | null;
  editingEntry?: {
    id: string;
    title: string | null;
    body: string;
    topic: PickerTopic;
  };
  onSubmitted?: () => void;
  onCancel?: () => void;
}

function loadStoredTopic(): PickerTopic | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_TOPIC_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.id && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

export function ComposeBox({
  defaultTopic = null,
  editingEntry,
  onSubmitted,
  onCancel,
}: ComposeBoxProps) {
  const router = useRouter();
  const isEditing = Boolean(editingEntry);
  const [topic, setTopic] = useState<PickerTopic | null>(
    editingEntry?.topic ?? defaultTopic ?? null
  );
  const [showTitle, setShowTitle] = useState(Boolean(editingEntry?.title));
  const [title, setTitle] = useState(editingEntry?.title ?? "");
  const [body, setBody] = useState(editingEntry?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    if (!editingEntry && !defaultTopic && !topic) {
      const stored = loadStoredTopic();
      // localStorage is only available on the client; reading it during render
      // would cause a hydration mismatch. The setState runs at most once on
      // first mount, so this is not a cascading-render situation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setTopic(stored);
    }
  }, [defaultTopic, editingEntry, topic]);

  const wordCount = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .split(/\s+/)
    .filter(Boolean).length;

  async function handleSubmit() {
    if (!topic) {
      setError("Pick a topic first.");
      return;
    }
    if (!body.trim()) {
      setError("Write something before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const url = isEditing
      ? `/api/systems/journal/entries/${editingEntry!.id}`
      : "/api/systems/journal/entries";
    const method = isEditing ? "PATCH" : "POST";
    const payload: Record<string, unknown> = { body, topicId: topic.id };
    if (showTitle && title.trim()) payload.title = title.trim();
    else if (isEditing) payload.title = null;

    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.error ?? "Could not save the entry. Try again.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topic));
      }

      if (!isEditing) {
        editorRef.current?.commands.clearContent();
        setBody("");
        setTitle("");
        setShowTitle(false);
      }
      onSubmitted?.();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="compose" onKeyDown={handleKeyDown}>
      <div className="compose-header">
        <TopicPicker selected={topic} onSelect={setTopic} />
        {!showTitle ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowTitle(true)}
          >
            + Title
          </button>
        ) : null}
      </div>
      {showTitle ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional title"
          style={{
            background: "var(--paper-0)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "6px 10px",
            fontFamily: "var(--font-serif)",
            fontSize: "1.05em",
            color: "var(--fg)",
          }}
        />
      ) : null}
      <JournalEditor
        initialBody={editingEntry?.body ?? ""}
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
        onChange={setBody}
      />
      {error ? (
        <p className="caption" style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}
      <div className="compose-footer">
        <span className="caption">{wordCount} words</span>
        <span className="caption">⌘↵ to save</span>
        <span className="grow" />
        {isEditing ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {isEditing ? "Save changes" : "Save"}
        </button>
      </div>
    </div>
  );
}
