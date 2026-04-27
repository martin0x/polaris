import { notFound } from "next/navigation";
import { getTopicByName } from "@/systems/journal/services/topics";
import { listEntries } from "@/systems/journal/services/entries";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryCard } from "@/systems/journal/components/EntryCard";
import { HashAnchorScroll } from "@/systems/journal/components/HashAnchorScroll";
import { TopicHeaderActions } from "@/systems/journal/components/TopicHeaderActions";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const topic = await getTopicByName(name);
  if (!topic) notFound();

  const entries = await listEntries({ topicId: topic.id, limit: 100 });

  return (
    <article className="doc">
      <HashAnchorScroll />
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-4)" }}>
        <div>
          <h1>{topic.name}</h1>
          {topic.description ? (
            <p className="lead" style={{ marginTop: -8 }}>{topic.description}</p>
          ) : null}
        </div>
        <TopicHeaderActions topic={{ id: topic.id, name: topic.name, archived: topic.archived }} />
      </header>

      <ComposeBox defaultTopic={{ id: topic.id, name: topic.name }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginTop: "var(--sp-6)" }}>
        {entries.length === 0 ? (
          <p className="lead">No entries under {topic.name} yet.</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
