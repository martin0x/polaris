import Link from "next/link";
import ReactMarkdown from "react-markdown";

// Stricter than the parser's tag regex: only treat `#tag` as a substitution
// candidate if the boundary is start-of-string or whitespace. This prevents URL
// fragments like `https://example.com/#section` from being rewritten as tag
// links, since `/` is non-word but isn't whitespace.
const TAG = /(?:^|\s)#([a-zA-Z][\w-]*)/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;

interface SubstitutedTextProps {
  value: string;
}

type WikiSegment =
  | { kind: "text"; text: string }
  | { kind: "wikilink"; name: string; raw: string };

type TagSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; name: string; raw: string; prefix: string };

function SubstitutedText({ value }: SubstitutedTextProps): React.ReactNode {
  // Walk wikilinks first, then tags within the surviving plain segments.
  const wikiSegments = splitByPattern<WikiSegment>(value, WIKILINK, (raw, match) => ({
    kind: "wikilink",
    name: match[1],
    raw,
  }));

  const final: React.ReactNode[] = [];
  let key = 0;
  for (const seg of wikiSegments) {
    if (seg.kind === "wikilink") {
      final.push(
        <Link
          key={`w-${key++}`}
          href={`/journal/topics/${encodeURIComponent(seg.name)}`}
          className="wikilink"
        >
          {seg.name}
        </Link>
      );
      continue;
    }
    const tagSegments = splitByPattern<TagSegment>(seg.text, TAG, (raw, match) => ({
      kind: "tag",
      name: match[1].toLowerCase(),
      raw,
      // The TAG regex consumes the boundary char in match[0]; restore it as a
      // separate text segment so that "logged a #bug" reads as
      // ["logged a ", <Link>#bug</Link>].
      prefix: raw.startsWith("#") ? "" : raw.slice(0, raw.indexOf("#")),
    }));
    for (const tag of tagSegments) {
      if (tag.kind === "tag") {
        if (tag.prefix) final.push(tag.prefix);
        final.push(
          <Link
            key={`t-${key++}`}
            href={`/journal/tags/${tag.name}`}
            className="tag-inline"
          >
            {`#${tag.name}`}
          </Link>
        );
      } else {
        final.push(tag.text);
      }
    }
  }
  return <>{final}</>;
}

function splitByPattern<T extends { kind: string }>(
  source: string,
  pattern: RegExp,
  build: (raw: string, match: RegExpExecArray) => Exclude<T, { kind: "text" }>
): T[] {
  const out: T[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: source.slice(last, m.index) } as T);
    }
    out.push(build(m[0], m) as T);
    last = m.index + m[0].length;
  }
  if (last < source.length) {
    out.push({ kind: "text", text: source.slice(last) } as T);
  }
  return out;
}

export function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="doc">
      <ReactMarkdown
        components={{
          // Substitute [[Topic]] / #tag in regular text nodes only —
          // react-markdown routes fenced and inline code through `code`,
          // which we leave untouched, so substitutions skip them automatically.
          p: ({ children }) => <p>{renderChildren(children)}</p>,
          li: ({ children }) => <li>{renderChildren(children)}</li>,
          h1: ({ children }) => <h2>{renderChildren(children)}</h2>,
          h2: ({ children }) => <h3>{renderChildren(children)}</h3>,
          h3: ({ children }) => <h4>{renderChildren(children)}</h4>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function renderChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return <SubstitutedText value={children} />;
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <SubstitutedText key={i} value={c} /> : c
    );
  }
  return children;
}
