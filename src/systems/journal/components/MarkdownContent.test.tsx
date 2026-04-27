import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "./MarkdownContent";

function html(body: string): string {
  return renderToStaticMarkup(<MarkdownContent body={body} />);
}

describe("MarkdownContent", () => {
  it("substitutes [[Topic]] for a topic link", () => {
    const out = html("see [[Polaris]] for context");
    expect(out).toContain('href="/journal/topics/Polaris"');
    expect(out).toContain(">Polaris<");
  });

  it("URL-encodes topic names with spaces", () => {
    const out = html("see [[Polaris notes]]");
    expect(out).toContain("/journal/topics/Polaris%20notes");
  });

  it("substitutes #tag for a tag link", () => {
    const out = html("logged a #bug today");
    expect(out).toContain('href="/journal/tags/bug"');
    expect(out).toContain("#bug");
  });

  it("does not substitute inside fenced code", () => {
    const out = html("```\nsee [[Polaris]] and #bug\n```");
    expect(out).not.toContain('href="/journal/topics/Polaris"');
    expect(out).not.toContain('href="/journal/tags/bug"');
  });

  it("does not substitute inside inline code", () => {
    const out = html("use `#bug` here, not really");
    expect(out).not.toContain('href="/journal/tags/bug"');
  });

  it("preserves URLs with hashes", () => {
    const out = html("see https://example.com/#section for details");
    expect(out).not.toContain('href="/journal/tags/section"');
  });
});
