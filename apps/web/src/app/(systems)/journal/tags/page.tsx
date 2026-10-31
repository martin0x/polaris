import Link from "next/link";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

export default async function TagsIndexPage() {
  const tags = await fetchQuery(api.journal.tags.list, {}, { token: await convexAuthNextjsToken() });

  return (
    <article className="doc">
      <h1>Tags</h1>
      {tags.length === 0 ? (
        <p className="lead">No tags yet. They appear automatically as you write.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tags.map(({ tag, count }) => (
            <li
              key={tag}
              style={{
                padding: "var(--sp-2) 0",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: "var(--sp-3)",
              }}
            >
              <Link href={`/journal/tags/${tag}`} className="tag-inline">
                {`#${tag}`}
              </Link>
              <span className="caption">{count} entries</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
