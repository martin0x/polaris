import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { tag, limit: 100 },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1>{`#${tag}`}</h1>
      <EntryFeed preloaded={preloaded} emptyText={`No entries with #${tag} yet.`} showCount />
    </article>
  );
}
