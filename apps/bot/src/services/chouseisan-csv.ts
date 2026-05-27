/**
 * Chouseisan integration via the official CSV export endpoint.
 *
 *   https://chouseisan.com/schedule/List/createCsv?h={hash}
 *
 * This is the "出欠表をダウンロード" link that the chouseisan UI exposes —
 * a stable, public endpoint that returns a Shift_JIS-encoded CSV.
 *
 * Discovered via the `ChouseisanReminder` Go library
 * (https://github.com/nowsprinting/ChouseisanReminder).
 *
 * Format:
 *   row 0: イベント名 (first column)
 *   row 1: 詳細説明文                                  ← skipped
 *   row 2: ヘッダ行 — col 0 空, col 1+ = 参加者名
 *   row 3+: データ行 — col 0 = 日付文字列, col 1+ = ○/×/△
 *   最後にコメント行が来る場合あり — col 0 が日付として parse できなければ skip
 */
import iconv from "iconv-lite";

const CSV_URL = "https://chouseisan.com/schedule/List/createCsv";
const FETCH_TIMEOUT_MS = 10_000;

const JST_OFFSET_MS = 9 * 60 * 60_000;

export interface ChouseisanCandidate {
  /** Original date string from chouseisan (e.g. "5/30(土) 22:00") */
  dateString: string;
  /** Parsed Unix ms (UTC), or null if dateString is not a valid date */
  startsAt: number | null;
  /** True if the original string included a time (HH:MM) */
  hasTime: boolean;
  /** ⭕ count */
  yes: number;
  /** ❌ count */
  no: number;
  /** △ + empty count */
  maybe: number;
  /** Names of ⭕ voters (in order) */
  yesNames: string[];
}

export interface ChouseisanData {
  eventName: string;
  candidates: ChouseisanCandidate[];
}

/**
 * Extract the hash from a chouseisan URL.
 * Accepts:
 *   - https://chouseisan.com/s?h=abc123
 *   - https://chouseisan.com/s/abc123
 *   - just "abc123" (raw hash, fallback)
 */
export function extractChouseisanHash(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try as URL first
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith("chouseisan.com")) return null;
    const h = url.searchParams.get("h");
    if (h && /^[a-zA-Z0-9-]{8,64}$/.test(h)) return h;
    // /s/{hash} path style
    const m = url.pathname.match(/\/s\/([a-zA-Z0-9-]{8,64})$/);
    if (m) return m[1];
    return null;
  } catch {
    // Not a URL — accept bare hash
    if (/^[a-zA-Z0-9-]{8,64}$/.test(trimmed)) return trimmed;
    return null;
  }
}

export class ChouseisanFetchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ChouseisanFetchError";
  }
}

/**
 * Fetch the CSV from chouseisan and parse it.
 * Throws ChouseisanFetchError on network / decode / not-found errors.
 */
export async function fetchChouseisanData(
  hash: string,
  now: number = Date.now()
): Promise<ChouseisanData> {
  const url = `${CSV_URL}?h=${encodeURIComponent(hash)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "FF14kotei-bot/1.0 (+https://github.com/mitchkunn/FF14-bot)",
      },
    });
  } catch (err) {
    throw new ChouseisanFetchError("chouseisan へのリクエストが失敗しました", err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ChouseisanFetchError(
      `chouseisan が ${res.status} を返しました (URL が間違っている / 期限切れ)`
    );
  }

  // If the response is HTML it means the hash is invalid (chouseisan returns
  // the SPA shell as a 200 OK for unknown hashes).
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new ChouseisanFetchError(
      "chouseisan の URL が無効か、イベントが削除されています"
    );
  }

  const buffer = await res.arrayBuffer();
  return parseChouseisanCsv(buffer, now);
}

/**
 * Pure parser for the Shift_JIS CSV returned by chouseisan.
 * Exported so tests can drive it without hitting the network.
 */
export function parseChouseisanCsv(
  buffer: ArrayBuffer,
  now: number = Date.now()
): ChouseisanData {
  const text = iconv.decode(Buffer.from(buffer), "Shift_JIS");
  const rows = parseCsvRows(text);
  if (rows.length < 3) {
    throw new ChouseisanFetchError("chouseisan の CSV 形式が想定外です (rows < 3)");
  }

  const eventName = rows[0][0]?.trim() ?? "(無題)";
  // rows[1] is description, skipped
  const headerRow = rows[2];
  const names = headerRow.slice(1).map((s) => s.trim());

  const candidates: ChouseisanCandidate[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const dateString = row[0]?.trim();
    if (!dateString) continue;
    const parsed = parseChouseisanDate(dateString, now);
    if (!parsed) continue; // comment row or unparseable — skip

    let yes = 0, no = 0, maybe = 0;
    const yesNames: string[] = [];
    for (let j = 1; j < row.length && j - 1 < names.length; j++) {
      const v = row[j]?.trim() ?? "";
      const name = names[j - 1];
      if (v === "○" || v === "◯") {
        yes++;
        if (name) yesNames.push(name);
      } else if (v === "×" || v === "✕" || v === "x" || v === "X") {
        no++;
      } else {
        // △ or empty cells
        maybe++;
      }
    }

    candidates.push({
      dateString,
      startsAt: parsed.startsAt,
      hasTime: parsed.hasTime,
      yes,
      no,
      maybe,
      yesNames,
    });
  }

  return { eventName, candidates };
}

/**
 * Parse a chouseisan date string into Unix ms (assumed JST).
 * Accepted patterns:
 *   "5/30"            → year inferred, time = 00:00 JST
 *   "5/30(土)"        → ditto
 *   "5/30 22:00"      → year inferred, hasTime=true
 *   "5/30(土) 22:00"  → ditto
 *   "5/30 22時"       → 22:00
 *
 * Year inference: if month < currentJstMonth → next year, else this year.
 */
export interface ParsedChouseisanDate {
  startsAt: number;
  hasTime: boolean;
}

export function parseChouseisanDate(
  raw: string,
  now: number = Date.now()
): ParsedChouseisanDate | null {
  const s = raw.trim();
  // Match "M/D" then optional "(曜)" then optional "HH:MM" or "HH時"
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})(?:\s*\([^)]*\))?(?:\s*(\d{1,2})(?::(\d{2})|時))?/u
  );
  if (!m) return null;
  const month = Number.parseInt(m[1], 10);
  const day = Number.parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hour = m[3] !== undefined ? Number.parseInt(m[3], 10) : 0;
  const minute = m[4] !== undefined ? Number.parseInt(m[4], 10) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const hasTime = m[3] !== undefined;

  // Infer year from current JST month
  const nowJst = new Date(now + JST_OFFSET_MS);
  const currentJstMonth = nowJst.getUTCMonth() + 1;
  const currentJstYear = nowJst.getUTCFullYear();
  const year = month < currentJstMonth ? currentJstYear + 1 : currentJstYear;

  // Build target as UTC then offset to JST
  const targetJstMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const startsAt = targetJstMs - JST_OFFSET_MS;
  return { startsAt, hasTime };
}

/**
 * Minimal CSV parser: handles double-quoted fields with escaped quotes,
 * commas inside quotes, and CRLF/LF line endings. No external dep.
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
    if (c === "\r") { i++; continue; } // CRLF
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
  // Last field / row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
