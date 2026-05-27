import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import {
  extractChouseisanHash,
  parseChouseisanCsv,
  parseChouseisanDate,
  parseCsvRows,
} from "./chouseisan-csv";

describe("extractChouseisanHash", () => {
  it("accepts ?h=... query URL", () => {
    expect(extractChouseisanHash("https://chouseisan.com/s?h=abc12345")).toBe("abc12345");
  });

  it("accepts /s/... path URL", () => {
    expect(extractChouseisanHash("https://chouseisan.com/s/abc12345")).toBe("abc12345");
  });

  it("accepts bare hash strings", () => {
    expect(extractChouseisanHash("abc12345")).toBe("abc12345");
  });

  it("trims surrounding whitespace", () => {
    expect(extractChouseisanHash("  https://chouseisan.com/s?h=abc12345  ")).toBe("abc12345");
  });

  it("rejects non-chouseisan URLs", () => {
    expect(extractChouseisanHash("https://example.com/?h=abc12345")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(extractChouseisanHash("")).toBeNull();
    expect(extractChouseisanHash("   ")).toBeNull();
  });

  it("rejects too-short hashes (< 8 chars)", () => {
    expect(extractChouseisanHash("https://chouseisan.com/s?h=short")).toBeNull();
  });

  it("rejects hashes with invalid chars (e.g. /)", () => {
    expect(extractChouseisanHash("https://chouseisan.com/s?h=abc/def123")).toBeNull();
  });
});

describe("parseChouseisanDate", () => {
  // Anchor: 2026-05-15 12:00 JST (= 2026-05-15 03:00 UTC)
  const NOW = Date.UTC(2026, 4, 15, 3, 0);

  it("parses 'M/D' (year inferred, time=00:00)", () => {
    const r = parseChouseisanDate("5/30", NOW)!;
    expect(r).not.toBeNull();
    expect(r.hasTime).toBe(false);
    // 2026-05-30 00:00 JST = 2026-05-29 15:00 UTC
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 29, 15, 0));
  });

  it("parses 'M/D(曜)' with weekday in parens", () => {
    const r = parseChouseisanDate("5/30(土)", NOW)!;
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 29, 15, 0));
    expect(r.hasTime).toBe(false);
  });

  it("parses 'M/D HH:MM'", () => {
    const r = parseChouseisanDate("5/30 22:00", NOW)!;
    expect(r.hasTime).toBe(true);
    // 2026-05-30 22:00 JST = 2026-05-30 13:00 UTC
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 30, 13, 0));
  });

  it("parses 'M/D(曜) HH:MM'", () => {
    const r = parseChouseisanDate("5/30(土) 22:00", NOW)!;
    expect(r.hasTime).toBe(true);
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 30, 13, 0));
  });

  it("parses 'M/D HH時' shorthand", () => {
    const r = parseChouseisanDate("5/30 22時", NOW)!;
    expect(r.hasTime).toBe(true);
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 30, 13, 0));
  });

  it("infers next year when month is in the past (Dec from May)", () => {
    const r = parseChouseisanDate("3/15", NOW)!;
    // March is before May → next year (2027)
    expect(r.startsAt).toBe(Date.UTC(2027, 2, 14, 15, 0));
  });

  it("uses current year when month is current or future", () => {
    const r = parseChouseisanDate("5/15", NOW)!; // exact match (current month)
    // 5/15 00:00 JST 2026
    expect(r.startsAt).toBe(Date.UTC(2026, 4, 14, 15, 0));
  });

  it("returns null for non-date strings (e.g. comment row)", () => {
    expect(parseChouseisanDate("コメント", NOW)).toBeNull();
    expect(parseChouseisanDate("", NOW)).toBeNull();
    expect(parseChouseisanDate("memo", NOW)).toBeNull();
  });

  it("returns null for invalid months/days", () => {
    expect(parseChouseisanDate("13/30", NOW)).toBeNull(); // month 13
    expect(parseChouseisanDate("5/32", NOW)).toBeNull();  // day 32
    expect(parseChouseisanDate("0/15", NOW)).toBeNull();  // month 0
  });

  it("returns null for invalid hours/minutes", () => {
    expect(parseChouseisanDate("5/30 25:00", NOW)).toBeNull(); // hour 25
    expect(parseChouseisanDate("5/30 22:60", NOW)).toBeNull(); // minute 60
  });
});

describe("parseCsvRows", () => {
  it("handles simple CSV", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas inside", () => {
    expect(parseCsvRows('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    expect(parseCsvRows('a,"b""c",d')).toEqual([["a", 'b"c', "d"]]);
  });

  it("handles trailing field without newline", () => {
    expect(parseCsvRows("a,b,c")).toEqual([["a", "b", "c"]]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsvRows("")).toEqual([]);
  });
});

describe("parseChouseisanCsv — end-to-end with synthetic data", () => {
  // 2026-05-15 12:00 JST
  const NOW = Date.UTC(2026, 4, 15, 3, 0);

  function makeCsv(text: string): ArrayBuffer {
    const buf = iconv.encode(text, "Shift_JIS");
    // Convert Buffer to ArrayBuffer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  it("parses a typical 3-candidate / 4-participant CSV", () => {
    const csv = [
      "次回固定日",                          // row 0: event name
      "宜しくお願いします",                   // row 1: description (skipped)
      ",アリス,ボブ,キャロル,デイブ",         // row 2: header (col 0 empty, names follow)
      "5/30(土) 22:00,○,○,△,×",              // candidate 1
      "5/31(日) 22:00,○,×,△,○",              // candidate 2
      "6/1(月) 22:00,×,×,△,△",               // candidate 3
      "コメント,いつでも OK,,△だけど頑張る,,", // last row = comment, skipped
    ].join("\n");

    const data = parseChouseisanCsv(makeCsv(csv), NOW);
    expect(data.eventName).toBe("次回固定日");
    expect(data.candidates).toHaveLength(3);

    const c0 = data.candidates[0];
    expect(c0.dateString).toBe("5/30(土) 22:00");
    expect(c0.hasTime).toBe(true);
    expect(c0.yes).toBe(2);
    expect(c0.no).toBe(1);
    expect(c0.maybe).toBe(1);
    expect(c0.yesNames).toEqual(["アリス", "ボブ"]);

    const c1 = data.candidates[1];
    expect(c1.yes).toBe(2);
    expect(c1.yesNames).toEqual(["アリス", "デイブ"]);

    const c2 = data.candidates[2];
    expect(c2.yes).toBe(0);
  });

  it("skips rows whose first column is not a date", () => {
    const csv = [
      "イベント名",
      "詳細",
      ",名前1",
      "5/30,○",
      "メモ,",
      "5/31,×",
    ].join("\n");
    const data = parseChouseisanCsv(makeCsv(csv), NOW);
    expect(data.candidates.map((c) => c.dateString)).toEqual(["5/30", "5/31"]);
  });

  it("throws on too-few rows", () => {
    expect(() => parseChouseisanCsv(makeCsv("a\nb"), NOW)).toThrow();
  });
});
