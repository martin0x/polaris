import { Children, isValidElement } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TaskCheckbox } from "./TaskCheckbox";
import { findTaskLines } from "../lib/tasks";

const TAG = /(?:^|\s)#([a-zA-Z][\w-]*)/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;

interface SubstitutedTextProps {
  value: string;
}

type WikiSegment = { kind: "wikilink"; name: string; raw: string };

type TagSegment = { kind: "tag"; name: string; raw: string; prefix: string };

function SubstitutedText({ value }: SubstitutedTextProps): React.ReactNode {
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

type TextSegment = { kind: "text"; text: string };

function splitByPattern<T extends { kind: string }>(
  source: string,
  pattern: RegExp,
  build: (raw: string, match: RegExpExecArray) => T
): (T | TextSegment)[] {
  const out: (T | TextSegment)[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: source.slice(last, m.index) });
    }
    out.push(build(m[0], m));
    last = m.index + m[0].length;
  }
  if (last < source.length) {
    out.push({ kind: "text", text: source.slice(last) });
  }
  return out;
}

interface MarkdownContentProps {
  body: string;
  entryId?: string;
}

export function MarkdownContent({ body, entryId }: MarkdownContentProps) {
  // Map source line number (0-based) -> task metadata. The Nth-task counter
  // approach fails under React StrictMode because <ReactMarkdown> is
  // double-rendered with the same `components` prop, sharing a mutable
  // closure that would be at index 1 by the second render. Position-based
  // lookup is stateless and idempotent.
  const taskLinesByLine = new Map(
    findTaskLines(body).map((t) => [t.line, t])
  );

  const components: Components = {
    p: ({ children }) => <p>{renderChildren(children)}</p>,
    li: ({ node, children, className, ...rest }) => {
      const classNames = hastClassList(node);
      const isTask = classNames.includes("task-list-item");
      if (isTask && entryId) {
        const sourceLine = hastSourceLine(node); // 0-based, or null
        const task = sourceLine !== null ? taskLinesByLine.get(sourceLine) : undefined;
        if (!task) {
          if (typeof window !== "undefined") {
            console.warn(
              "[MarkdownContent] task-list-item rendered without matching source marker; rendering as disabled checkbox",
              { sourceLine, taskLines: Array.from(taskLinesByLine.keys()) }
            );
          }
          const checked = hastTaskItemChecked(node);
          return (
            <li className="task-item" data-checked={checked ? "true" : "false"}>
              <input type="checkbox" checked={checked} disabled aria-label="Task (read-only)" />
              <span className="task-label">{filterOutInputs(children)}</span>
            </li>
          );
        }
        return (
          <TaskCheckbox
            entryId={entryId}
            lineNumber={task.line}
            initiallyChecked={task.checked}
            body={body}
          >
            {filterOutInputs(children)}
          </TaskCheckbox>
        );
      }
      return (
        <li className={className} {...rest}>
          {renderChildren(children)}
        </li>
      );
    },
    ul: ({ node, className, children, ...rest }) => {
      const classNames = hastClassList(node);
      if (classNames.includes("contains-task-list")) {
        return (
          <ul className="task-list" {...rest}>
            {children}
          </ul>
        );
      }
      return (
        <ul className={className} {...rest}>
          {children}
        </ul>
      );
    },
    h1: ({ children }) => <h2>{renderChildren(children)}</h2>,
    h2: ({ children }) => <h3>{renderChildren(children)}</h3>,
    h3: ({ children }) => <h4>{renderChildren(children)}</h4>,
  };

  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
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

type HastPosition = {
  start?: { line?: number };
};

type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastElement[];
  position?: HastPosition;
};

function hastSourceLine(node: unknown): number | null {
  if (!node || typeof node !== "object") return null;
  const n = node as HastElement;
  const startLine = n.position?.start?.line;
  // hast/mdast use 1-based line numbers; convert to 0-based for our maps.
  return typeof startLine === "number" ? startLine - 1 : null;
}

function hastClassList(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as HastElement;
  const cls = n.properties?.className;
  if (Array.isArray(cls)) return cls.map(String);
  if (typeof cls === "string") return cls.split(/\s+/);
  return [];
}

function hastTaskItemChecked(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as HastElement;
  const input = n.children?.find(
    (c) => c?.type === "element" && c?.tagName === "input"
  );
  return input?.properties?.checked === true;
}

function filterOutInputs(children: React.ReactNode): React.ReactNode {
  return Children.toArray(children).filter((c) => {
    if (isValidElement(c) && c.type === "input") return false;
    return true;
  });
}
