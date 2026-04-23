export function matchRoute(
  pattern: string,
  method: string,
  pathSegments: string[]
): Record<string, string> | null {
  const spaceIndex = pattern.indexOf(" ");
  const patternMethod = pattern.slice(0, spaceIndex);
  const patternPath = pattern.slice(spaceIndex + 1);

  if (patternMethod !== method) return null;

  const patternParts = patternPath.split("/").filter(Boolean);
  if (patternParts.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathSegments[i];
    } else if (patternParts[i] !== pathSegments[i]) {
      return null;
    }
  }

  return params;
}
