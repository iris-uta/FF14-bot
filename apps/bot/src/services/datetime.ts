/**
 * Parse a user-input datetime string as JST (Asia/Tokyo, UTC+9).
 * Accepted formats:
 *   "2025-06-01 21:00"
 *   "2025-06-01T21:00"
 *   "2025-06-01 21:00:00"
 *   "2025/06/01 21:00"
 * Returns Unix milliseconds (UTC), or null on parse failure.
 */
export function parseJstDateTime(input: string): number | null {
  const trimmed = input.trim();
  const normalized = trimmed.replace(/\//g, "-").replace(" ", "T");

  // Match YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const m = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)$/);
  if (!m) return null;

  // Append JST offset; let Date parse the ISO-ish string
  const withOffset = `${m[1]}+09:00`;
  const ts = Date.parse(withOffset);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Format Unix ms for Discord display using <t:SECONDS:F> markdown.
 * F = "Tuesday, June 1, 2025 9:00 PM" style (localized to viewer's timezone).
 */
export function formatDiscordTime(unixMs: number, style: "F" | "R" | "f" | "t" | "D" | "d" = "F"): string {
  const seconds = Math.floor(unixMs / 1000);
  return `<t:${seconds}:${style}>`;
}
