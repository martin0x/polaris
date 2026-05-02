"use client";

import { useState } from "react";
import type { JournalEntryWithTopic } from "../services/entries";
import { relativeTime } from "../lib/format";
import { ComposeBox } from "./ComposeBox";
import { EntryActions } from "./EntryActions";
import { MarkdownContent } from "./MarkdownContent";
import { TopicChip } from "./TopicChip";
import { TagChip } from "./TagChip";

export function EntryCard({ entry }: { entry: JournalEntryWithTopic }) {
  const [editing, setEditing] = useState(false);
  const edited = entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000;

  if (editing) {
    return (
      <ComposeBox
        editingEntry={{
          id: entry.id,
          title: entry.title,
          body: entry.body,
          topic: { id: entry.topic.id, name: entry.topic.name },
        }}
        onSubmitted={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article id={`entry-${entry.id}`} className="entry-card">
      <div className="meta">
        <TopicChip name={entry.topic.name} />
        {entry.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        <span className="time" title={new Date(entry.createdAt).toISOString()}>
          {relativeTime(new Date(entry.createdAt))}
        </span>
        <EntryActions entryId={entry.id} onEdit={() => setEditing(true)} />
      </div>
      {entry.title ? (
        <h3 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{entry.title}</h3>
      ) : null}
      <MarkdownContent body={entry.body} />
      {edited ? (
        <p className="caption" style={{ margin: 0 }}>
          Edited {relativeTime(new Date(entry.updatedAt))}
        </p>
      ) : null}
    </article>
  );
}
