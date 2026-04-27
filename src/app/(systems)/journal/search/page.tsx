import Link from "next/link";
import { searchEntries } from "@/systems/journal/services/search";
import { highlight } from "@/systems/journal/services/highlight";
import { TopicChip } from "@/systems/journal/components/TopicChip";
import { TagChip } from "@/systems/journal/components/TagChip";

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relative(d: Date): string {
  const minutes = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  return RTF.format(Math.round(hours / 24), "day");
}

export default async function SearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();
  const results = trimmed ? await searchEntries({ q: trimmed, limit: 50 }) : [];

  return (
    <article className="doc">
      <h1>Search</h1>
      <p className="caption" style={{ marginTop: -8 }}>
        {trimmed ? <>Results for <em>{trimmed}</em></> : "Type a query in the journal toolbar."}
      </p>

      {trimmed && results.length === 0 ? (
        <p className="lead">No matches for <em>{trimmed}</em>. Try a different word.</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {results.map((entry) => (
          <Link
            key={entry.id}
            href={`/journal/topics/${encodeURIComponent(entry.topic.name)}#entry-${entry.id}`}
            className="entry-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="meta">
              <TopicChip name={entry.topic.name} />
              {entry.tags.map((t) => (
                <TagChip key={t} tag={t} />
              ))}
              <span className="time">{relative(new Date(entry.createdAt))}</span>
            </div>
            {entry.title ? (
              <h3
                style={{ fontFamily: "var(--font-serif)", margin: 0 }}
                dangerouslySetInnerHTML={{ __html: highlight(entry.title, trimmed) }}
              />
            ) : null}
            <p
              style={{ margin: 0, color: "var(--fg-muted)" }}
              dangerouslySetInnerHTML={{
                __html: highlight(snippet(entry.body, trimmed), trimmed),
              }}
            />
          </Link>
        ))}
      </div>
    </article>
  );
}

function snippet(body: string, query: string, radius = 80): string {
  if (!query) return body.slice(0, radius * 2);
  const idx = body.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0] ?? "");
  if (idx < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + radius);
  return (start > 0 ? "… " : "") + body.slice(start, end) + (end < body.length ? " …" : "");
}
