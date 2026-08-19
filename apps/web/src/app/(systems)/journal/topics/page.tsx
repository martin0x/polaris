import Link from "next/link";
import { listTopics } from "@/systems/journal/services/topics";
import { relativeTime } from "@/systems/journal/lib/format";
import { prisma } from "@/platform/db/client";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "true";
  const topics = await listTopics({ includeArchived });

  const stats = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const statByTopic = new Map(
    stats.map((s) => [
      s.topicId,
      { count: s._count._all, lastAt: s._max.createdAt },
    ])
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
          {topics.map((topic) => {
            const stat = statByTopic.get(topic.id);
            return (
              <li key={topic.id}>
                <Link
                  href={`/journal/topics/${encodeURIComponent(topic.name)}`}
                  className={
                    topic.archived ? "topic-card archived" : "topic-card"
                  }
                >
                  <span className="topic-card-name">{topic.name}</span>
                  {topic.description ? (
                    <span className="topic-card-desc">{topic.description}</span>
                  ) : null}
                  <span className="topic-card-meta">
                    {stat
                      ? `${stat.count} ${stat.count === 1 ? "entry" : "entries"}`
                      : "No entries yet"}
                    {stat?.lastAt
                      ? ` · last entry ${relativeTime(stat.lastAt)}`
                      : ""}
                    {topic.archived ? " · archived" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="caption" style={{ marginTop: "var(--sp-6)" }}>
        <Link
          href={`/journal/topics?archived=${includeArchived ? "false" : "true"}`}
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </p>
    </article>
  );
}
