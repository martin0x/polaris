const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
const TAG = /(?:^|[^\w])#([a-zA-Z][\w-]*)/g;

function stripCode(body: string): string {
  return body.replace(FENCED_CODE, "").replace(INLINE_CODE, "");
}

export function extractTags(body: string): string[] {
  if (!body) return [];
  const stripped = stripCode(body);
  const seen = new Set<string>();
  for (const match of stripped.matchAll(TAG)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

export function wordCount(body: string): number {
  if (!body) return 0;
  const stripped = stripCode(body);
  return stripped.split(/\s+/).filter(Boolean).length;
}
