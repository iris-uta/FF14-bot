import { describe, it, expect, beforeEach } from "vitest";
import { isContentPublished } from "@ff14kotei/schema";
import {
  getAllContents,
  getAllContentsIncludingTesting,
  getContentById,
  reloadContents,
} from "./contents";

// These are data-driven invariants over the real data/contents/*.yaml.
// They encode the policy ("零式 are testing-only until verified") rather than
// exact counts, so they stay green as contents are added/promoted.
beforeEach(() => {
  reloadContents();
});

describe("getAllContents (published-only — the user-facing list)", () => {
  it("returns only published content", () => {
    expect(getAllContents().every(isContentPublished)).toBe(true);
  });

  it("hides every testing content — no savage (零式) leaks into the bot pickers", () => {
    expect(getAllContents().some((c) => c.type === "savage")).toBe(false);
  });

  it("still exposes published content (e.g. the ultimate FRU)", () => {
    expect(getAllContents().some((c) => c.id === "fru")).toBe(true);
  });
});

describe("getAllContentsIncludingTesting (backend / dev view)", () => {
  it("includes testing content that getAllContents hides", () => {
    const all = getAllContentsIncludingTesting();
    expect(all.length).toBeGreaterThan(getAllContents().length);
    expect(all.some((c) => c.type === "savage")).toBe(true);
  });
});

describe("getContentById (id resolution is always allowed)", () => {
  it("resolves a testing content by id so existing statics keep auto-detecting", () => {
    const m1s = getContentById("m1s");
    expect(m1s).toBeDefined();
    expect(m1s?.status).toBe("testing");
  });

  it("resolves a published content by id (status omitted = published)", () => {
    const fru = getContentById("fru");
    expect(fru).toBeDefined();
    expect(isContentPublished(fru!)).toBe(true);
  });
});
