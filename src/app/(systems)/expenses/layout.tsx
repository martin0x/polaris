import Link from "next/link";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="tab-strip" aria-label="Expenses sections">
        <Link href="/expenses">Activities</Link>
        <Link href="/expenses/trends">Trends</Link>
        <Link href="/expenses/types">Types</Link>
      </nav>
      {children}
    </>
  );
}
