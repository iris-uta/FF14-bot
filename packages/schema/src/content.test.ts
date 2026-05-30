import { describe, it, expect } from "vitest";
import {
  ContentSchema,
  isContentPublished,
  isContentActive,
  isContentTesting,
  isContentInactive,
  CONTENT_STATUSES,
} from "./content";

function baseContent(macros: unknown[]): unknown {
  return {
    id: "x",
    displayName: "X",
    shortName: "X",
    type: "savage",
    phases: [
      { id: "p1", name: "P1", order: 1 },
      { id: "p2-back", name: "後半", order: 2 },
    ],
    macros,
    references: { urls: [] },
  };
}

describe("MacroRefSchema.phases", () => {
  it("is optional — a macro without phases[] still validates", () => {
    const r = ContentSchema.safeParse(baseContent([{ source: "s", url: "https://e.com" }]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.macros[0].phases).toBeUndefined();
  });

  it("accepts phases[] that reference real phase ids (incl. non-numeric ids)", () => {
    const r = ContentSchema.safeParse(
      baseContent([{ source: "s", url: "https://e.com", phases: ["p1", "p2-back"] }])
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.macros[0].phases).toEqual(["p1", "p2-back"]);
  });
});

describe("ContentSchema phase-id integrity (superRefine)", () => {
  it("rejects a macro whose phases[] references an unknown phase id", () => {
    const r = ContentSchema.safeParse(
      baseContent([{ source: "s", url: "https://e.com", phases: ["p9"] }])
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues[0];
      expect(issue.path).toEqual(["macros", 0, "phases", 0]);
      expect(issue.message).toContain("p9");
    }
  });

  it("points at the exact bad entry when only one of several ids is wrong", () => {
    const r = ContentSchema.safeParse(
      baseContent([{ source: "s", url: "https://e.com", phases: ["p1", "nope"] }])
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues).toHaveLength(1);
      expect(r.error.issues[0].path).toEqual(["macros", 0, "phases", 1]);
    }
  });

  it("still validates content whose macros have no phases[] at all", () => {
    const r = ContentSchema.safeParse(
      baseContent([{ source: "s", url: "https://e.com", text: "/p" }])
    );
    expect(r.success).toBe(true);
  });
});

describe("ContentSchema.status (lifecycle: testing/active/inactive)", () => {
  it("is optional — omitted status is treated as active (visible)", () => {
    const r = ContentSchema.safeParse(baseContent([]));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBeUndefined();
      expect(isContentActive(r.data)).toBe(true);
      expect(isContentPublished(r.data)).toBe(true);
    }
  });

  it("accepts 'testing' — not visible, flagged as testing", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "testing" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("testing");
      expect(isContentTesting(r.data)).toBe(true);
      expect(isContentPublished(r.data)).toBe(false);
    }
  });

  it("accepts explicit 'active' — visible", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "active" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("active");
      expect(isContentActive(r.data)).toBe(true);
      expect(isContentPublished(r.data)).toBe(true);
    }
  });

  it("accepts 'inactive' — archived, not visible", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "inactive" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("inactive");
      expect(isContentInactive(r.data)).toBe(true);
      expect(isContentPublished(r.data)).toBe(false);
    }
  });

  it("normalizes legacy 'published' to 'active' (backward-compat alias)", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "published" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("active");
      expect(isContentPublished(r.data)).toBe(true);
    }
  });

  it("rejects an unknown status value", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "draft" });
    expect(r.success).toBe(false);
  });

  it("CONTENT_STATUSES is the ordered lifecycle (published excluded — input-only alias)", () => {
    expect(CONTENT_STATUSES).toEqual(["testing", "active", "inactive"]);
  });
});
