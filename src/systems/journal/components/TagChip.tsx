import Link from "next/link";

export function TagChip({ tag }: { tag: string }) {
  return (
    <Link href={`/journal/tags/${tag}`} className="tag-inline">
      {`#${tag}`}
    </Link>
  );
}
