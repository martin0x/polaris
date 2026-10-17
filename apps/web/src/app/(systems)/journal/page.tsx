import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { MANILA_TZ, manilaDayStartMs } from "@polaris/core/months";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: MANILA_TZ,
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: MANILA_TZ,
});

function formatHeader(d: Date): string {
  return `${DATE_FORMAT.format(d)} · ${WEEKDAY_FORMAT.format(d)}`;
}

// "Today" is the Asia/Manila calendar day (phase 3 decision log 7); phase 4
// moves it to the device.
export default async function JournalTodayPage() {
  const now = new Date();
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { sinceMs: manilaDayStartMs(now.getTime()), limit: 100 },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>{formatHeader(now)}</h1>
      <ComposeBox />
      <EntryFeed
        preloaded={preloaded}
        emptyText="No entries today. Pick a topic and start logging."
        spaceAbove
      />
    </article>
  );
}
