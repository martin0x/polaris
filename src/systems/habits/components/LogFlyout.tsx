"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/Icon";
import type { DetailEntry } from "../services/detail";
import { formatDayShort } from "../lib/dates";

export interface LogTarget {
  habitId: string;
  habitName: string;
  topicName: string;
  date: string;
}

interface LogFlyoutProps {
  target: LogTarget;
  logs: DetailEntry[];
  onClose: () => void;
  /** Resolves null on success; an error message string on failure. */
  onCreate: (title: string, body: string) => Promise<string | null>;
}

export function LogFlyout({ target, logs, onClose, onCreate }: LogFlyoutProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Retargeting the flyout to a new day/habit is a discrete, prop-driven
    // event (not a render-triggered loop), so this reset is not a cascading
    // render (see ComposeBox for the precedent).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle("");
    setBody("");
    setError(null);
    titleRef.current?.focus();
  }, [target.habitId, target.date]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await onCreate(title.trim(), body);
    setBusy(false);
    if (err) setError(err); // success closes the flyout from the parent
  };

  const topicHref = `/journal/topics/${encodeURIComponent(target.topicName)}`;

  return (
    <aside
      ref={panelRef}
      className="flyout"
      role="dialog"
      aria-label={`Log ${target.habitName} — ${formatDayShort(target.date)}`}
    >
      <header className="flyout-head">
        <div className="flyout-title-wrap">
          <span className="flyout-title">{target.habitName}</span>
          <span className="flyout-sub">{formatDayShort(target.date)}</span>
        </div>
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </header>
      {logs.length > 0 && (
        <ul className="flyout-list">
          {logs.map((e) => (
            <li key={e.id}>
              <Link href={`${topicHref}#entry-${e.id}`}>{e.title ?? e.excerpt}</Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flyout-form">
        <input
          ref={titleRef}
          className="habit-add-input"
          placeholder="Title (optional)"
          aria-label="Title (optional)"
          maxLength={200}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="habit-quote-input"
          placeholder="Write the log — #tags work."
          aria-label="Log body"
          rows={8}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="habit-error">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !body.trim()}
          onClick={() => void submit()}
        >
          Add log
        </button>
      </div>
    </aside>
  );
}
