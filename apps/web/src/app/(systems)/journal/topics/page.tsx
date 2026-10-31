import Link from "next/link";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { relativeTime } from "@polaris/core/format";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "true";
  const topics = await fetchQuery(
    api.journal.topics.listWithStats,
    { includeArchived },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1>Topics</h1>
      {topics.length === 0 ? (
        <p className="lead">
          No topics yet. Create one when you log your first entry.
        </p>
      ) : (
        <ul className="topic-grid">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/journal/topics/${encodeURIComponent(topic.name)}`}
                className={topic.archived ? "topic-card archived" : "topic-card"}
              >
                <span className="topic-card-name">{topic.name}</span>
                {topic.description ? (
                  <span className="topic-card-desc">{topic.description}</span>
                ) : null}
                <span className="topic-card-meta">
                  {topic.entryCount > 0
                    ? `${topic.entryCount} ${topic.entryCount === 1 ? "entry" : "entries"}`
                    : "No entries yet"}
                  {topic.lastEntryAt !== null
                    ? ` · last entry ${relativeTime(new Date(topic.lastEntryAt))}`
                    : ""}
                  {topic.archived ? " · archived" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="caption" style={{ marginTop: "var(--sp-6)" }}>
        <Link href={`/journal/topics?archived=${includeArchived ? "false" : "true"}`}>
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </p>
    </article>
  );
}
