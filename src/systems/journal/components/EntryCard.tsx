import type { JournalEntryWithTopic } from "../services/entries";
import { MarkdownContent } from "./MarkdownContent";
import { TopicChip } from "./TopicChip";
import { TagChip } from "./TagChip";

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relativeTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  return RTF.format(days, "day");
}

export function EntryCard({ entry }: { entry: JournalEntryWithTopic }) {
  const edited = entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000;
  return (
    <article id={`entry-${entry.id}`} className="entry-card">
      <div className="meta">
        <TopicChip name={entry.topic.name} />
        {entry.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        <span className="time" title={entry.createdAt.toISOString()}>
          {relativeTime(entry.createdAt)}
        </span>
      </div>
      {entry.title ? (
        <h3 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{entry.title}</h3>
      ) : null}
      <MarkdownContent body={entry.body} />
      {edited ? (
        <p className="caption" style={{ margin: 0 }}>
          Edited {relativeTime(entry.updatedAt)}
        </p>
      ) : null}
    </article>
  );
}
