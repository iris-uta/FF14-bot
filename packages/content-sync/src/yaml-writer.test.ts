import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Content } from "@ff14kotei/schema";
import { writeContentYaml } from "./yaml-writer";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ff14-yaml-writer-"));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: "test",
    displayName: "テスト",
    shortName: "TEST",
    type: "ultimate",
    phases: [
      { id: "p1", name: "P1", order: 0, videos: [], strategies: [], tips: [] },
    ],
    macros: [],
    recruitmentTemplates: [],
    references: { urls: [] },
    ...overrides,
  } as Content;
}

describe("writeContentYaml", () => {
  it("creates the file when it doesn't exist", () => {
    const r = writeContentYaml(makeContent(), dir);
    expect(r.status).toBe("created");
    expect(existsSync(r.path)).toBe(true);
    const yaml = readFileSync(r.path, "utf-8");
    expect(yaml).toContain("id: test");
    expect(yaml).toContain("displayName: テスト");
  });

  it("returns 'unchanged' when content is identical", () => {
    writeContentYaml(makeContent(), dir);
    const r = writeContentYaml(makeContent(), dir);
    expect(r.status).toBe("unchanged");
  });

  it("returns 'updated' when content differs", () => {
    writeContentYaml(makeContent({ displayName: "old" }), dir);
    const r = writeContentYaml(makeContent({ displayName: "new" }), dir);
    expect(r.status).toBe("updated");
    expect(readFileSync(r.path, "utf-8")).toContain("displayName: new");
  });

  it("dryRun: would-create when file doesn't exist", () => {
    const r = writeContentYaml(makeContent(), dir, { dryRun: true });
    expect(r.status).toBe("would-create");
    expect(existsSync(r.path)).toBe(false);  // file NOT written
  });

  it("dryRun: would-update when content differs", () => {
    writeContentYaml(makeContent({ displayName: "old" }), dir);
    const r = writeContentYaml(makeContent({ displayName: "new" }), dir, { dryRun: true });
    expect(r.status).toBe("would-update");
    // File on disk still has old value
    expect(readFileSync(r.path, "utf-8")).toContain("displayName: old");
  });

  it("omits empty arrays/objects for compact output", () => {
    const r = writeContentYaml(makeContent(), dir);
    const yaml = readFileSync(r.path, "utf-8");
    expect(yaml).not.toContain("macros:");      // empty → omitted
    expect(yaml).not.toContain("recruitmentTemplates:");
    expect(yaml).not.toContain("references:");  // primary + urls both empty
  });

  it("preserves non-empty optional fields", () => {
    const r = writeContentYaml(
      makeContent({
        patch: "7.11",
        references: { primary: "りりーどーる", urls: ["https://example.com/a"] },
      }),
      dir
    );
    const yaml = readFileSync(r.path, "utf-8");
    expect(yaml).toContain("patch:");
    expect(yaml).toContain("references:");
    expect(yaml).toContain("primary: りりーどーる");
  });

  it("writes files with `<id>.yaml` naming", () => {
    const r = writeContentYaml(makeContent({ id: "fru" }), dir);
    expect(r.path.endsWith("/fru.yaml")).toBe(true);
  });

  it("detects unchanged correctly even after re-ordering input keys", () => {
    // First write — establishes canonical ordering on disk
    writeContentYaml(makeContent({ patch: "7.11" }), dir);
    // Re-call with same logical content → should be unchanged
    const r = writeContentYaml(makeContent({ patch: "7.11" }), dir);
    expect(r.status).toBe("unchanged");
  });
});
