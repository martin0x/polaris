const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s)/;

export interface TaskLine {
  line: number;
  checked: boolean;
  raw: string;
}

export function findTaskLines(body: string): TaskLine[] {
  const lines = body.split("\n");
  const out: TaskLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE);
    if (m) {
      out.push({
        line: i,
        checked: m[2].toLowerCase() === "x",
        raw: lines[i],
      });
    }
  }
  return out;
}

export function toggleTaskAtLine(body: string, lineNumber: number): string {
  const lines = body.split("\n");
  if (lineNumber < 0 || lineNumber >= lines.length) {
    throw new Error(`toggleTaskAtLine: line ${lineNumber} out of range`);
  }
  const original = lines[lineNumber];
  const next = original.replace(TASK_LINE, (_, before, mark, after) => {
    const flipped = mark === " " ? "x" : " ";
    return `${before}${flipped}${after}`;
  });
  if (next === original) {
    throw new Error(`toggleTaskAtLine: line ${lineNumber} is not a task marker`);
  }
  lines[lineNumber] = next;
  return lines.join("\n");
}
