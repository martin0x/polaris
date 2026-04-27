import Link from "next/link";
import { listTopics } from "@/systems/journal/services/topics";
import { prisma } from "@/platform/db/client";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "true";
  const topics = await listTopics({ includeArchived });

  const counts = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const countByTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));

  return (
    <article className="doc">
      <h1>Topics</h1>
      {topics.length === 0 ? (
        <p className="lead">No topics yet. Create one when you log your first entry.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {topics.map((topic) => (
            <li key={topic.id} style={{ padding: "var(--sp-2) 0", borderBottom: "1px solid var(--border)" }}>
              <Link
                href={`/journal/topics/${encodeURIComponent(topic.name)}`}
                style={{ color: "var(--fg)", textDecoration: "none" }}
              >
                <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.1em" }}>{topic.name}</span>
                <span className="caption" style={{ marginLeft: "var(--sp-3)" }}>
                  {countByTopic.get(topic.id) ?? 0} entries
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
