import { notFound } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";
import { HashAnchorScroll } from "@/systems/journal/components/HashAnchorScroll";
import { TopicHeaderActions } from "@/systems/journal/components/TopicHeaderActions";
import { SortRedirect } from "@/systems/journal/components/SortRedirect";
import { parseSortOrder } from "@/systems/journal/lib/sort-preference";

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { name } = await params;
  const { sort: sortParam } = await searchParams;
  let decodedName: string;
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    // Malformed percent-encoding (e.g. a lone "%") — there's no such topic.
    notFound();
  }
  const token = await convexAuthNextjsToken();
  const topic = await fetchQuery(
    api.journal.topics.getByName,
    { name: decodedName },
    { token }
  );
  if (!topic) notFound();

  const sort = parseSortOrder(sortParam);
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { topicId: topic.id, sort, limit: 100 },
    { token }
  );

  return (
    <article className="doc">
      <HashAnchorScroll />
      <SortRedirect />
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

      <EntryFeed
        preloaded={preloaded}
        emptyText={`No entries under ${topic.name} yet.`}
        spaceAbove
      />
    </article>
  );
}
