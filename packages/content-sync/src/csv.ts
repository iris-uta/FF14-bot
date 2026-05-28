/**
 * Minimal CSV parser. Handles:
 *   - double-quoted fields with embedded commas and newlines
 *   - escaped quotes ("" inside a quoted field)
 *   - CRLF / LF line endings
 *
 * Same pattern as apps/bot/src/services/chouseisan-csv.ts — kept duplicated
 * rather than extracted because this package can't depend on apps/bot.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuote = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') { inQuote = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV with a header row into objects keyed by column name.
 *  - First non-empty row is treated as the header
 *  - Empty rows (all fields blank) are skipped
 *  - Trailing whitespace on each cell is trimmed
 *  - Numeric columns stay strings (caller decides how to coerce)
 */
export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim().length > 0));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = (row[i] ?? "").trim();
    }
    return obj;
  });
}
