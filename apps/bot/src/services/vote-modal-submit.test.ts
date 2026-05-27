import { describe, it, expect } from "vitest";
import { parseCandidatesTextarea } from "./vote-modal-submit";

describe("parseCandidatesTextarea", () => {
  it("splits by newline", () => {
    expect(parseCandidatesTextarea("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCandidatesTextarea("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from each line", () => {
    expect(parseCandidatesTextarea("  a  \n\tb\t\n  c")).toEqual(["a", "b", "c"]);
  });

  it("skips empty lines", () => {
    expect(parseCandidatesTextarea("a\n\nb\n  \nc")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for empty input", () => {
    expect(parseCandidatesTextarea("")).toEqual([]);
    expect(parseCandidatesTextarea("\n\n")).toEqual([]);
  });

  it("parses 5 dates as 5 candidates", () => {
    const text = [
      "2026-06-01 21:00",
      "2026-06-02 21:00",
      "2026-06-03 21:00",
      "2026-06-04 21:00",
      "2026-06-05 21:00",
    ].join("\n");
    expect(parseCandidatesTextarea(text)).toHaveLength(5);
  });
});
