import Link from "next/link";

export function TopicChip({ name }: { name: string }) {
  return (
    <Link
      href={`/journal/topics/${encodeURIComponent(name)}`}
      className="tag-inline"
      style={{
        background: "var(--accent-wash)",
        color: "var(--accent-ink)",
      }}
    >
      {name}
    </Link>
  );
}
