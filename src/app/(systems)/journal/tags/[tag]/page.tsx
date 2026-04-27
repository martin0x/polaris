import { listEntries } from "@/systems/journal/services/entries";
import { EntryCard } from "@/systems/journal/components/EntryCard";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const entries = await listEntries({ tag, limit: 100 });

  return (
    <article className="doc">
      <h1>{`#${tag}`}</h1>
      <p className="caption" style={{ marginTop: -8 }}>
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {entries.length === 0 ? (
          <p className="lead">No entries with #{tag} yet.</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
