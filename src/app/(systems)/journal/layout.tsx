import Link from "next/link";

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="tab-strip" aria-label="Journal sections">
        <Link href="/journal">Today</Link>
        <Link href="/journal/topics">Topics</Link>
        <Link href="/journal/tags">Tags</Link>
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
      </nav>
      {children}
    </>
  );
}
