const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlight(text: string, query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;

  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  return escaped.replace(pattern, '<mark class="hl">$1</mark>');
}
