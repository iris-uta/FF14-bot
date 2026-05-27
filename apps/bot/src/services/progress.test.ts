import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import {
  createProgressLog,
  listProgressLogsForStatic,
  getProgressLog,
  deleteProgressLog,
  renderProgressTimeline,
  buildTwitterSummary,
  formatProgressLine,
  isValidProgressStatus,
  PROGRESS_STATUSES,
  type ProgressStatus,
} from "./progress";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const T0 = Date.UTC(2026, 3, 1); // 2026-04-01

function make(
  id: string,
  status: ProgressStatus,
  loggedAt: number,
  overrides: { phaseId?: string | null; note?: string | null; userId?: string; staticId?: string } = {}
) {
  // Use `in` checks so `phaseId: null` is preserved (?? would coerce to default).
  const phaseId = "phaseId" in overrides ? overrides.phaseId! : "p1";
  const note = "note" in overrides ? overrides.note! : null;
  return createProgressLog({
    id,
    staticId: overrides.staticId ?? "s1",
    guildId: "g1",
    userId: overrides.userId ?? "u1",
    phaseId,
    status,
    note,
    loggedAt,
  });
}

describe("isValidProgressStatus", () => {
  it.each(PROGRESS_STATUSES)("accepts %s", (s) => {
    expect(isValidProgressStatus(s)).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isValidProgressStatus("bogus")).toBe(false);
  });
});

describe("createProgressLog + getProgressLog", () => {
  it("round-trips a log", () => {
    make("log-1", "reached", T0, { note: "first reach" });
    const got = getProgressLog("log-1");
    expect(got?.status).toBe("reached");
    expect(got?.note).toBe("first reach");
    expect(got?.loggedAt).toBe(T0);
  });

  it("allows null phaseId for note status", () => {
    make("note-1", "note", T0, { phaseId: null, note: "session canceled" });
    const got = getProgressLog("note-1");
    expect(got?.phaseId).toBeNull();
    expect(got?.note).toBe("session canceled");
  });
});

describe("listProgressLogsForStatic", () => {
  it("returns only logs for the given static, sorted asc by loggedAt", () => {
    make("late", "cleared", T0 + 86_400_000 * 30);
    make("early", "reached", T0);
    make("middle", "reached", T0 + 86_400_000 * 10);
    make("other-static", "reached", T0, { staticId: "s2" });

    const list = listProgressLogsForStatic("s1");
    expect(list.map((l) => l.id)).toEqual(["early", "middle", "late"]);
  });

  it("returns [] for an unknown static", () => {
    expect(listProgressLogsForStatic("missing")).toEqual([]);
  });
});

describe("deleteProgressLog", () => {
  it("removes the log", () => {
    make("log-1", "reached", T0);
    deleteProgressLog("log-1");
    expect(getProgressLog("log-1")).toBeNull();
  });
});

describe("formatProgressLine", () => {
  it("includes icon + Discord date + phase + label", () => {
    const log = make("v", "cleared", T0, { phaseId: "p3" });
    const line = formatProgressLine(log);
    expect(line).toContain("🎯");           // cleared icon
    expect(line).toContain("撃破");           // status label
    expect(line).toContain("p3");            // phase
    expect(line).toContain(`<t:${T0 / 1000}:D>`); // Discord date
  });

  it("appends note when present", () => {
    const log = make("v", "reached", T0, { phaseId: "p2", note: "stable" });
    expect(formatProgressLine(log)).toContain("— stable");
  });

  it("handles unknown status by falling back to note", () => {
    const log = { ...make("v", "reached", T0), status: "bogus-status" };
    const line = formatProgressLine(log);
    expect(line).toContain("📝"); // note fallback icon
  });
});

describe("renderProgressTimeline", () => {
  it("has a 'まだ記録がありません' message when empty", () => {
    const data = renderProgressTimeline("S", []).toJSON();
    expect(data.description).toContain("まだ記録がありません");
  });

  it("groups by month", () => {
    make("a", "reached", Date.UTC(2026, 3, 1));   // April
    make("b", "reached", Date.UTC(2026, 3, 15));  // April
    make("c", "cleared", Date.UTC(2026, 4, 1));   // May
    const logs = listProgressLogsForStatic("s1");
    const data = renderProgressTimeline("週末絶エデン", logs).toJSON();
    expect(data.description).toContain("2026/04");
    expect(data.description).toContain("2026/05");
  });

  it("groups by JST month even when UTC date differs", () => {
    // 2026-06-01 06:00 JST = 2026-05-31 21:00 UTC
    // Old (UTC) grouping put this under May; JST grouping must put it under June.
    const jstJuneFirst = Date.UTC(2026, 4, 31, 21, 0); // 5/31 21:00 UTC = 6/1 06:00 JST
    make("borderline", "reached", jstJuneFirst);
    const logs = listProgressLogsForStatic("s1");
    const data = renderProgressTimeline("S", logs).toJSON();
    expect(data.description).toContain("2026/06");
    expect(data.description).not.toContain("2026/05");
  });

  it("shows total count in footer", () => {
    for (let i = 0; i < 3; i++) make(`log-${i}`, "reached", T0 + i * 1000);
    const logs = listProgressLogsForStatic("s1");
    const data = renderProgressTimeline("S", logs).toJSON();
    expect(data.footer?.text).toContain("3 件");
  });
});

describe("buildTwitterSummary", () => {
  it("includes the static name and the most recent 5 entries", () => {
    for (let i = 0; i < 8; i++) make(`log-${i}`, "reached", T0 + i * 86_400_000);
    const logs = listProgressLogsForStatic("s1");
    const text = buildTwitterSummary("週末絶エデン", logs);
    expect(text).toContain("【週末絶エデン 進行記録】");
    // most recent 5 → log-3..log-7 (5 most recent dates)
    // Just check it ends up shorter than full list
    expect(text.split("\n")).toHaveLength(6); // header + 5 entries
  });
});

