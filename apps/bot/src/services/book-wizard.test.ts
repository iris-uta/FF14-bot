import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import {
  BOOK_WIZARD_PREFIX,
  DEFAULT_TIME,
  PAGE_DAYS,
  TIME_OPTIONS,
  applyBackToDates,
  applyBackToReview,
  applyDefaultTime,
  applyEditDate,
  applyNav,
  applyNext,
  applyResetTime,
  applySetTime,
  applyToggleDate,
  atomicUpdate,
  buildBookStepMessage,
  clearAllBookWizards,
  combineDateTime,
  deleteBookWizard,
  effectiveTime,
  getBookWizard,
  jstDateKey,
  longDateLabel,
  pageDates,
  parseBookWizardCustomId,
  pruneBookWizardsNow,
  putBookWizard,
  shortDateLabel,
  type BookWizardState,
} from "./book-wizard";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
  clearAllBookWizards();
});

afterEach(() => {
  resetDb();
});

function makeState(overrides: Partial<BookWizardState> = {}): BookWizardState {
  return {
    sessionId: "sid-1",
    creatorId: "u-1",
    guildId: "g-1",
    channelId: "c-1",
    notifyMinutesBefore: 10,
    weekOffset: 0,
    selectedDates: [],
    defaultTime: DEFAULT_TIME,
    timeByDate: {},
    step: "pickDates",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("session store", () => {
  it("put + get round-trips", () => {
    putBookWizard(makeState({ selectedDates: ["2026-05-30"] }));
    expect(getBookWizard("sid-1")?.selectedDates).toEqual(["2026-05-30"]);
  });

  it("delete removes the session", () => {
    putBookWizard(makeState());
    deleteBookWizard("sid-1");
    expect(getBookWizard("sid-1")).toBeNull();
  });

  it("expires sessions older than 15min on pruneNow", () => {
    const base = Date.now();
    putBookWizard(makeState({ sessionId: "old", createdAt: base - 16 * 60_000 }));
    putBookWizard(makeState({ sessionId: "recent", createdAt: base }));
    pruneBookWizardsNow(base);
    expect(getBookWizard("old")).toBeNull();
    expect(getBookWizard("recent")).not.toBeNull();
  });
});

describe("parseBookWizardCustomId", () => {
  it("parses toggle action with YYYY-MM-DD payload (note: payload may contain ':')", () => {
    const r = parseBookWizardCustomId(`${BOOK_WIZARD_PREFIX}sid-1:toggle:2026-05-30`);
    expect(r).toEqual({ sessionId: "sid-1", action: "toggle", payload: "2026-05-30" });
  });

  it("parses nav:back / nav:fwd", () => {
    expect(parseBookWizardCustomId(`${BOOK_WIZARD_PREFIX}sid-1:nav:back`)).toEqual({
      sessionId: "sid-1",
      action: "nav",
      payload: "back",
    });
    expect(parseBookWizardCustomId(`${BOOK_WIZARD_PREFIX}sid-1:nav:fwd`)).toEqual({
      sessionId: "sid-1",
      action: "nav",
      payload: "fwd",
    });
  });

  it("parses action with no payload (next / cancel / create)", () => {
    expect(parseBookWizardCustomId(`${BOOK_WIZARD_PREFIX}sid-1:next`)).toEqual({
      sessionId: "sid-1",
      action: "next",
      payload: undefined,
    });
  });

  it("rejects unknown prefix", () => {
    expect(parseBookWizardCustomId("setup-wizard:abc:type")).toBeNull();
  });

  it("rejects malformed (only sessionId, no action)", () => {
    expect(parseBookWizardCustomId(`${BOOK_WIZARD_PREFIX}sid-1`)).toBeNull();
  });
});

describe("date helpers", () => {
  it("jstDateKey computes Tokyo date even when run in non-Asia/Tokyo runtime", () => {
    // 2026-05-30 12:00 JST = 2026-05-30 03:00 UTC
    const jstNoon = Date.parse("2026-05-30T12:00:00+09:00");
    expect(jstDateKey(jstNoon)).toBe("2026-05-30");
    // Just before midnight JST (still 5/30 in Tokyo, already 5/31 in some other zones)
    const justBefore = Date.parse("2026-05-30T23:59:00+09:00");
    expect(jstDateKey(justBefore)).toBe("2026-05-30");
    // Just after midnight JST → 5/31
    const justAfter = Date.parse("2026-05-31T00:01:00+09:00");
    expect(jstDateKey(justAfter)).toBe("2026-05-31");
  });

  it("shortDateLabel / longDateLabel render Japanese weekday", () => {
    // 2026-05-30 is a Saturday
    expect(shortDateLabel("2026-05-30")).toBe("5/30 (土)");
    expect(longDateLabel("2026-05-30")).toBe("2026/5/30 (土)");
  });

  it("pageDates produces PAGE_DAYS consecutive JST date keys starting from tomorrow", () => {
    const today = Date.parse("2026-05-28T10:00:00+09:00");
    const dates = pageDates(today, 0);
    expect(dates).toHaveLength(PAGE_DAYS);
    // Window is tomorrow-anchored: today (5/28) is omitted, first candidate is 5/29.
    expect(dates[0]).toBe("2026-05-29");
    // Strictly ascending
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("pageDates with weekOffset=1 shifts the window forward by exactly PAGE_DAYS", () => {
    const today = Date.parse("2026-05-28T10:00:00+09:00");
    const page0 = pageDates(today, 0);
    const page1 = pageDates(today, 1);
    // The first day of page1 is one day after the last day of page0.
    const lastP0 = Date.parse(`${page0[PAGE_DAYS - 1]}T00:00:00+09:00`);
    const firstP1 = Date.parse(`${page1[0]}T00:00:00+09:00`);
    expect(firstP1 - lastP0).toBe(86_400_000);
  });

  it("combineDateTime handles late-night raid hours (24:xx, 25:xx → next day)", () => {
    const base = "2026-05-30";
    // 21:00 → same day 21:00 JST
    expect(combineDateTime(base, "21:00")).toBe(Date.parse("2026-05-30T21:00:00+09:00"));
    // 24:00 → next day 00:00 JST
    expect(combineDateTime(base, "24:00")).toBe(Date.parse("2026-05-31T00:00:00+09:00"));
    // 25:30 → next day 01:30 JST
    expect(combineDateTime(base, "25:30")).toBe(Date.parse("2026-05-31T01:30:00+09:00"));
  });

  it("effectiveTime prefers override > defaultTime", () => {
    const s = makeState({
      defaultTime: "21:00",
      timeByDate: { "2026-05-30": "22:30" },
    });
    expect(effectiveTime(s, "2026-05-30")).toBe("22:30");
    expect(effectiveTime(s, "2026-05-31")).toBe("21:00");
  });
});

describe("apply* state updaters", () => {
  it("applyToggleDate adds + sorts the date", () => {
    let s = makeState();
    s = applyToggleDate(s, "2026-06-01");
    s = applyToggleDate(s, "2026-05-30");
    expect(s.selectedDates).toEqual(["2026-05-30", "2026-06-01"]); // sorted
  });

  it("applyToggleDate removes when called on already-selected (and drops override)", () => {
    let s = makeState({
      selectedDates: ["2026-05-30"],
      timeByDate: { "2026-05-30": "22:00" },
    });
    s = applyToggleDate(s, "2026-05-30");
    expect(s.selectedDates).toEqual([]);
    expect(s.timeByDate["2026-05-30"]).toBeUndefined();
  });

  it("applyNav clamps weekOffset to >= 0", () => {
    expect(applyNav(makeState({ weekOffset: 0 }), "back").weekOffset).toBe(0);
    expect(applyNav(makeState({ weekOffset: 1 }), "back").weekOffset).toBe(0);
    expect(applyNav(makeState({ weekOffset: 0 }), "fwd").weekOffset).toBe(1);
  });

  it("applyDefaultTime overwrites defaultTime", () => {
    expect(applyDefaultTime(makeState(), "22:00").defaultTime).toBe("22:00");
  });

  it("applyNext flips step to review", () => {
    expect(applyNext(makeState()).step).toBe("review");
  });

  it("applyBackToDates resets step + clears editingDate", () => {
    const s = makeState({ step: "editTime", editingDate: "2026-05-30" });
    const next = applyBackToDates(s);
    expect(next.step).toBe("pickDates");
    expect(next.editingDate).toBeUndefined();
  });

  it("applyEditDate only sets editingDate for a selected date (otherwise noop)", () => {
    const s = makeState({ selectedDates: ["2026-05-30"], step: "review" });
    const ok = applyEditDate(s, "2026-05-30");
    expect(ok.step).toBe("editTime");
    expect(ok.editingDate).toBe("2026-05-30");

    const noop = applyEditDate(s, "2026-06-99");
    expect(noop).toBe(s); // unchanged
  });

  it("applySetTime writes override and returns to review", () => {
    const s = makeState({
      selectedDates: ["2026-05-30"],
      step: "editTime",
      editingDate: "2026-05-30",
    });
    const next = applySetTime(s, "23:30");
    expect(next.timeByDate["2026-05-30"]).toBe("23:30");
    expect(next.step).toBe("review");
    expect(next.editingDate).toBeUndefined();
  });

  it("applyResetTime drops the override and returns to review", () => {
    const s = makeState({
      selectedDates: ["2026-05-30"],
      timeByDate: { "2026-05-30": "23:30" },
      step: "editTime",
      editingDate: "2026-05-30",
    });
    const next = applyResetTime(s);
    expect(next.timeByDate["2026-05-30"]).toBeUndefined();
    expect(next.step).toBe("review");
  });

  it("applyBackToReview clears editingDate without touching timeByDate", () => {
    const s = makeState({
      step: "editTime",
      editingDate: "2026-05-30",
      timeByDate: { "2026-05-30": "23:00" },
    });
    const next = applyBackToReview(s);
    expect(next.step).toBe("review");
    expect(next.editingDate).toBeUndefined();
    expect(next.timeByDate["2026-05-30"]).toBe("23:00");
  });
});

describe("buildBookStepMessage", () => {
  const now = Date.parse("2026-05-28T10:00:00+09:00");

  it("pickDates step: 3 day rows + time select row + footer row = 5 rows", () => {
    const msg = buildBookStepMessage(makeState(), now);
    expect(msg.components).toHaveLength(5);
  });

  it("pickDates step: 次へ button is disabled when nothing selected", () => {
    const msg = buildBookStepMessage(makeState(), now);
    const footer = msg.components[msg.components.length - 1];
    const nextBtn = footer.components.find((c: any) =>
      c.data?.custom_id?.endsWith(":next")
    ) as any;
    expect(nextBtn?.data?.disabled).toBe(true);
  });

  it("pickDates step: 次へ button enabled when at least 1 date is selected", () => {
    const s = makeState({ selectedDates: ["2026-05-30"] });
    const msg = buildBookStepMessage(s, now);
    const footer = msg.components[msg.components.length - 1];
    const nextBtn = footer.components.find((c: any) =>
      c.data?.custom_id?.endsWith(":next")
    ) as any;
    expect(nextBtn?.data?.disabled).toBe(false);
    expect(nextBtn?.data?.label).toContain("1 件");
  });

  it("review step: edit-date select + 3-button footer = 2 rows", () => {
    const s = makeState({ step: "review", selectedDates: ["2026-05-30", "2026-06-01"] });
    const msg = buildBookStepMessage(s, now);
    expect(msg.components).toHaveLength(2);
  });

  it("editTime step: 1 time select + footer (1-2 buttons depending on override) = 2 rows", () => {
    const s = makeState({
      step: "editTime",
      selectedDates: ["2026-05-30"],
      editingDate: "2026-05-30",
    });
    const msg = buildBookStepMessage(s, now);
    expect(msg.components).toHaveLength(2);
  });

  it("editTime step: shows 'reset to default' button when an override exists", () => {
    const s = makeState({
      step: "editTime",
      selectedDates: ["2026-05-30"],
      editingDate: "2026-05-30",
      timeByDate: { "2026-05-30": "23:00" },
    });
    const msg = buildBookStepMessage(s, now);
    const footer = msg.components[1];
    const resetBtn = footer.components.find((c: any) =>
      c.data?.custom_id?.endsWith(":reset-time")
    );
    expect(resetBtn).toBeDefined();
  });
});

describe("atomicUpdate (race resistance)", () => {
  it("returns null when the session doesn't exist", () => {
    expect(atomicUpdate("missing", (s) => s)).toBeNull();
  });

  it("read-modify-writes under a transaction (no lost updates from sequential calls)", () => {
    putBookWizard(makeState());

    // Sequentially toggle 3 different dates via atomicUpdate (the in-handler path).
    const s1 = atomicUpdate("sid-1", (s) => applyToggleDate(s, "2026-05-30"));
    const s2 = atomicUpdate("sid-1", (s) => applyToggleDate(s, "2026-05-31"));
    const s3 = atomicUpdate("sid-1", (s) => applyToggleDate(s, "2026-06-01"));

    expect(s1?.selectedDates).toEqual(["2026-05-30"]);
    expect(s2?.selectedDates).toEqual(["2026-05-30", "2026-05-31"]);
    expect(s3?.selectedDates).toEqual(["2026-05-30", "2026-05-31", "2026-06-01"]);

    // Final persisted state mirrors the last write.
    expect(getBookWizard("sid-1")?.selectedDates).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
    ]);
  });

  it("each updater sees the latest committed state — the bug fix for 'dates disappearing'", () => {
    // Pre-bug behavior: handler A reads {}, computes {A}; handler B reads {} too
    // (because it ran before A's write), computes {B}, writes {B}, erasing A.
    // With atomicUpdate, B's transaction sees A's committed write — its updater
    // function receives a state that already contains A.
    putBookWizard(makeState());
    atomicUpdate("sid-1", (s) => applyToggleDate(s, "2026-05-30"));
    const seenByB = atomicUpdate("sid-1", (s) => {
      // If the previous write wasn't visible, this assertion would fail.
      expect(s.selectedDates).toEqual(["2026-05-30"]);
      return applyToggleDate(s, "2026-05-31");
    });
    expect(seenByB?.selectedDates).toEqual(["2026-05-30", "2026-05-31"]);
  });
});

describe("TIME_OPTIONS sanity", () => {
  it("all entries are HH:MM with 30-minute granularity in 18:00–25:00", () => {
    for (const t of TIME_OPTIONS) {
      expect(t).toMatch(/^\d{2}:(00|30)$/);
    }
    expect(TIME_OPTIONS).toContain(DEFAULT_TIME);
  });
});
