import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import {
  listLifecycleOverrides,
  getLifecycleOverrideMap,
  setLifecycleOverride,
  clearLifecycleOverride,
} from "./content-lifecycle";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});
afterEach(() => {
  resetDb();
});

describe("content-lifecycle service", () => {
  it("starts empty — sparse table, no rows until an override is set", () => {
    expect(listLifecycleOverrides()).toEqual([]);
    expect(getLifecycleOverrideMap().size).toBe(0);
  });

  it("sets and reads back an override (with metadata)", () => {
    setLifecycleOverride("fru", "inactive", "admin");
    expect(getLifecycleOverrideMap().get("fru")).toBe("inactive");
    const rows = listLifecycleOverrides();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contentId: "fru", status: "inactive", updatedBy: "admin" });
    expect(rows[0].updatedAt).toBeGreaterThan(0);
  });

  it("upserts on contentId — a second set replaces, leaving no duplicate row", () => {
    setLifecycleOverride("m1s", "active");
    setLifecycleOverride("m1s", "testing", "admin");
    expect(listLifecycleOverrides()).toHaveLength(1);
    expect(getLifecycleOverrideMap().get("m1s")).toBe("testing");
  });

  it("clears an override so the content reverts to its YAML seed", () => {
    setLifecycleOverride("top", "inactive");
    clearLifecycleOverride("top");
    expect(getLifecycleOverrideMap().has("top")).toBe(false);
  });
});
