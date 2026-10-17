import { listEntries } from "@/systems/journal/services/entries";
import { EntryCard } from "@/systems/journal/components/EntryCard";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

function formatHeader(d: Date): string {
  return `${DATE_FORMAT.format(d)} · ${WEEKDAY_FORMAT.format(d)}`;
}

export default async function JournalTodayPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const entries = await listEntries({ limit: 100 });
  const todays = entries.filter((e) => e.createdAt >= startOfToday);

  return (
    <article className="doc">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>
        {formatHeader(new Date())}
      </h1>
      <ComposeBox />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginTop: "var(--sp-6)" }}>
        {todays.length === 0 ? (
          <p className="lead">No entries today. Pick a topic and start logging.</p>
        ) : (
          todays.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
