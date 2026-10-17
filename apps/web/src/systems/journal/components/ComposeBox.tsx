"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import type { Editor } from "@tiptap/react";
import { JournalEditor } from "./Editor";
import { TopicPicker, type PickerTopic } from "./TopicPicker";

// v2: the old key held Postgres topic ids, which Convex rejects
// (phase 3 decision log 14). The user picks a topic once after the switch.
const LAST_TOPIC_KEY = "journal:lastTopic:v2";

interface ComposeBoxProps {
  defaultTopic?: PickerTopic | null;
  editingEntry?: {
    id: Id<"journalEntries">;
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
  const createEntry = useMutation(api.journal.entries.create);
  const updateEntry = useMutation(api.journal.entries.update);
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
    const topicId = topic.id as Id<"journalTopics">;
    const entryTitle = showTitle && title.trim() ? title.trim() : null;
    try {
      if (editingEntry) {
        await updateEntry({ id: editingEntry.id, topicId, title: entryTitle, body });
      } else {
        await createEntry({ topicId, body, ...(entryTitle ? { title: entryTitle } : {}) });
      }
      window.localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topic));
      if (!editingEntry) {
        editorRef.current?.commands.clearContent();
        setBody("");
        setTitle("");
        setShowTitle(false);
      }
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Could not save the entry. Try again.");
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
