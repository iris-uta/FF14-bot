import { describe, it, expect } from "vitest";
import { parseJstDateTime, formatDiscordTime } from "./datetime";

describe("parseJstDateTime", () => {
  it("parses 'YYYY-MM-DD HH:mm' as JST", () => {
    const ts = parseJstDateTime("2025-06-01 21:00");
    // JST 21:00 = UTC 12:00 same day
    expect(ts).toBe(Date.UTC(2025, 5, 1, 12, 0, 0));
  });

  it("parses ISO-like 'YYYY-MM-DDTHH:mm'", () => {
    expect(parseJstDateTime("2025-06-01T21:00")).toBe(Date.UTC(2025, 5, 1, 12, 0, 0));
  });

  it("parses with seconds", () => {
    expect(parseJstDateTime("2025-06-01 21:00:30")).toBe(Date.UTC(2025, 5, 1, 12, 0, 30));
  });

  it("parses 'YYYY/MM/DD HH:mm'", () => {
    expect(parseJstDateTime("2025/06/01 21:00")).toBe(Date.UTC(2025, 5, 1, 12, 0, 0));
  });

  it("returns null for malformed input", () => {
    expect(parseJstDateTime("June 1")).toBeNull();
    expect(parseJstDateTime("")).toBeNull();
    expect(parseJstDateTime("21:00")).toBeNull();
    expect(parseJstDateTime("not a date")).toBeNull();
  });

  it("handles whitespace", () => {
    expect(parseJstDateTime("  2025-06-01 21:00  ")).toBe(Date.UTC(2025, 5, 1, 12, 0, 0));
  });
});

describe("formatDiscordTime", () => {
  it("formats as <t:seconds:F> by default", () => {
    const ms = Date.UTC(2025, 5, 1, 12, 0, 0);
    expect(formatDiscordTime(ms)).toBe(`<t:${ms / 1000}:F>`);
  });

  it("accepts custom style", () => {
    const ms = Date.UTC(2025, 5, 1, 12, 0, 0);
    expect(formatDiscordTime(ms, "R")).toBe(`<t:${ms / 1000}:R>`);
  });
});
