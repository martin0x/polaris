import { TabStrip } from "@/app/_components/TabStrip";

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TabStrip
        label="Journal sections"
        items={[
          { label: "Today", href: "/journal", exact: true },
          { label: "Topics", href: "/journal/topics" },
          { label: "Tags", href: "/journal/tags" },
        ]}
      >
        <span className="grow" />
        <form action="/journal/search" method="GET">
          <input
            type="search"
            name="q"
            placeholder="Search journal"
            className="search-input"
            aria-label="Search journal"
          />
        </form>
      </TabStrip>
      {children}
    </>
  );
}
