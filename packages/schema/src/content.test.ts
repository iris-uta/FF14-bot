import { describe, it, expect } from "vitest";
import { ContentSchema, isContentPublished } from "./content";

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

describe("ContentSchema.status", () => {
  it("is optional — omitted status is treated as published (backward compatible)", () => {
    const r = ContentSchema.safeParse(baseContent([]));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBeUndefined();
      expect(isContentPublished(r.data)).toBe(true);
    }
  });

  it("accepts 'testing' and reports it as not-published", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "testing" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("testing");
      expect(isContentPublished(r.data)).toBe(false);
    }
  });

  it("accepts an explicit 'published'", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "published" });
    expect(r.success).toBe(true);
    if (r.success) expect(isContentPublished(r.data)).toBe(true);
  });

  it("rejects an unknown status value", () => {
    const r = ContentSchema.safeParse({ ...(baseContent([]) as object), status: "draft" });
    expect(r.success).toBe(false);
  });
});
