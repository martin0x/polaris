export function parseAllowlist(allowlist: string | undefined): string[] {
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(
  email: string | null | undefined,
  allowlist: string | undefined,
): boolean {
  if (!email) return false;
  return parseAllowlist(allowlist).includes(email.toLowerCase());
}
