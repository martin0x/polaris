const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function firstLine(body: string, maxLength: number): string {
  if (!body) return "";
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length <= maxLength ? line : line.slice(0, maxLength - 1) + "…";
}

export function relativeTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  return RTF.format(days, "day");
}
