import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isContentPublished } from "@ff14kotei/schema";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "./db";
import {
  getAllContents,
  getAllContentsIncludingTesting,
  getContentById,
  getEffectiveStatus,
  reloadContents,
} from "./contents";
import { setLifecycleOverride, clearLifecycleOverride } from "../services/content-lifecycle";

// These are data-driven invariants over the real data/contents/*.yaml.
// They encode the policy ("零式 are testing-only until verified") rather than
// exact counts, so they stay green as contents are added/promoted.
// A fresh :memory: DB per test isolates the lifecycle overrides that the
// effective-status merge now reads.
beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
  reloadContents();
});
afterEach(() => {
  resetDb();
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

describe("lifecycle override (DB) drives the effective status", () => {
  it("hides an active content from getAllContents once toggled to inactive", () => {
    expect(getAllContents().some((c) => c.id === "fru")).toBe(true);
    setLifecycleOverride("fru", "inactive", "admin");
    expect(getAllContents().some((c) => c.id === "fru")).toBe(false); // now hidden
    expect(getContentById("fru")?.status).toBe("inactive"); // id resolution reflects it
    expect(getEffectiveStatus("fru")).toBe("inactive");
  });

  it("promotes a testing content to active so it appears in the user list", () => {
    expect(getAllContents().some((c) => c.id === "m1s")).toBe(false); // testing → hidden by default
    setLifecycleOverride("m1s", "active", "admin");
    expect(getAllContents().some((c) => c.id === "m1s")).toBe(true); // now visible
    expect(getEffectiveStatus("m1s")).toBe("active");
  });

  it("reverts to the YAML seed when the override is cleared", () => {
    setLifecycleOverride("m1s", "active");
    clearLifecycleOverride("m1s");
    expect(getEffectiveStatus("m1s")).toBe("testing"); // back to YAML seed
    expect(getAllContents().some((c) => c.id === "m1s")).toBe(false);
  });
});
