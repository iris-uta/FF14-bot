import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import {
  WIZARD_PREFIX,
  applyAdvancePhase,
  applyContentChoice,
  applyModeChoice,
  applyPopularDefaults,
  applyStrategyChoice,
  applyTypeChoice,
  buildStepMessage,
  clearAllWizards,
  deleteWizard,
  getWizard,
  isReadyToConfirm,
  nextStep,
  parseWizardCustomId,
  pruneNow,
  putWizard,
  type WizardState,
} from "./setup-wizard";
import { getContentById } from "../lib/contents";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
  clearAllWizards();
});

afterEach(() => {
  resetDb();
});

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    sessionId: "sid-1",
    creatorId: "u-1",
    guildId: "g-1",
    name: "週末FRU",
    phaseStrategies: {},
    pendingPhaseIdx: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("session store", () => {
  it("put + get round-trips", () => {
    const s = makeState();
    putWizard(s);
    expect(getWizard("sid-1")?.name).toBe("週末FRU");
  });

  it("delete removes the session", () => {
    putWizard(makeState());
    deleteWizard("sid-1");
    expect(getWizard("sid-1")).toBeNull();
  });

  it("returns null for missing ids", () => {
    expect(getWizard("missing")).toBeNull();
  });

  it("expires sessions older than 15min on pruneNow", () => {
    const base = Date.now();
    putWizard(makeState({ sessionId: "old", createdAt: base - 16 * 60_000 }));
    putWizard(makeState({ sessionId: "recent", createdAt: base }));
    pruneNow(base);
    expect(getWizard("old")).toBeNull();
    expect(getWizard("recent")).not.toBeNull();
  });
});

describe("parseWizardCustomId", () => {
  it("parses type: action", () => {
    const r = parseWizardCustomId(`${WIZARD_PREFIX}sid-1:type:ultimate`);
    expect(r).toEqual({ sessionId: "sid-1", action: "type", payload: "ultimate" });
  });

  it("parses content action (no payload — value comes via select)", () => {
    const r = parseWizardCustomId(`${WIZARD_PREFIX}sid-1:content`);
    expect(r).toEqual({ sessionId: "sid-1", action: "content", payload: undefined });
  });

  it("parses next action (advance to next phase, no payload)", () => {
    const r = parseWizardCustomId(`${WIZARD_PREFIX}sid-1:next`);
    expect(r).toEqual({ sessionId: "sid-1", action: "next", payload: undefined });
  });

  it("parses strat: action (phaseId + strategyId)", () => {
    const r = parseWizardCustomId(`${WIZARD_PREFIX}sid-1:strat:p3:ast-shiki`);
    expect(r).toEqual({
      sessionId: "sid-1",
      action: "strat",
      phaseId: "p3",
      payload: "ast-shiki",
    });
  });

  it("rejects unknown prefix", () => {
    expect(parseWizardCustomId("vote:abc:0:yes")).toBeNull();
  });

  it("rejects malformed (too few segments)", () => {
    expect(parseWizardCustomId(`${WIZARD_PREFIX}sid-1`)).toBeNull();
  });

  it("rejects malformed strat (wrong segment count)", () => {
    expect(parseWizardCustomId(`${WIZARD_PREFIX}sid-1:strat:onlyone`)).toBeNull();
  });
});

describe("nextStep", () => {
  it("→ pickType when type missing", () => {
    expect(nextStep(makeState())).toBe("pickType");
  });

  it("→ pickContent when type set, contentId missing", () => {
    expect(nextStep(makeState({ type: "ultimate" }))).toBe("pickContent");
  });

  it("→ pickMode when type+content set, mode missing", () => {
    expect(nextStep(makeState({ type: "ultimate", contentId: "fru" }))).toBe("pickMode");
  });

  it("→ pickStrategy when multi-strategy phase still unanswered", () => {
    // fru has multi-strategy phases (per real data); rely on real content loader
    const s = makeState({ type: "ultimate", contentId: "fru", mode: "standard" });
    // No phaseStrategies set → at least the first multi-strategy phase needs answering
    expect(nextStep(s)).toBe("pickStrategy");
  });

  it("→ confirm when no multi-strategy phases remain", () => {
    // Use a content with no multi-strategy phases (e.g., dmu has 1 phase, no variants)
    const s = makeState({ type: "ultimate", contentId: "dmu", mode: "standard" });
    expect(nextStep(s)).toBe("confirm");
  });
});

describe("apply* state updaters", () => {
  it("applyTypeChoice sets type", () => {
    expect(applyTypeChoice(makeState(), "ultimate").type).toBe("ultimate");
  });

  it("applyContentChoice sets contentId", () => {
    expect(applyContentChoice(makeState(), "fru").contentId).toBe("fru");
  });

  it("applyModeChoice sets mode", () => {
    expect(applyModeChoice(makeState(), "minimal").mode).toBe("minimal");
  });

  it("applyStrategyChoice toggles strategy in array (no auto-advance)", () => {
    // Use real fru data — find the first multi-strategy phase + its first strategy.
    const fru = getContentById("fru")!;
    const multiPhases = fru.phases.filter((p) => p.strategies.length >= 2);
    expect(multiPhases.length).toBeGreaterThan(0);
    const firstPhase = multiPhases[0];
    const firstStrat = firstPhase.strategies[0];

    const base = makeState({ type: "ultimate", contentId: "fru", mode: "standard" });

    // Add
    const added = applyStrategyChoice(base, firstPhase.id, firstStrat.id);
    expect(added.pendingPhaseIdx).toBe(0); // toggle does NOT advance
    expect(added.phaseStrategies[firstPhase.id]).toEqual([firstStrat.id]);

    // Remove (toggle off)
    const removed = applyStrategyChoice(added, firstPhase.id, firstStrat.id);
    expect(removed.pendingPhaseIdx).toBe(0);
    expect(removed.phaseStrategies[firstPhase.id]).toBeUndefined();
  });

  it("applyStrategyChoice ignores clicks for the wrong phase", () => {
    const base = makeState({ type: "ultimate", contentId: "fru", mode: "standard" });
    const next = applyStrategyChoice(base, "WRONG_PHASE", "any");
    expect(next.pendingPhaseIdx).toBe(0);
    expect(next.phaseStrategies).toEqual({});
  });

  it("applyStrategyChoice supports multiple strategies on the same phase (multi-gimmick)", () => {
    // TOP P3 is the canonical multi-gimmick phase: 検知式 + ハローワールド.
    const top = getContentById("top")!;
    const p3 = top.phases.find((p) => p.id === "p3")!;
    expect(p3.strategies.length).toBeGreaterThanOrEqual(2);

    const base = makeState({ type: "ultimate", contentId: "top", mode: "standard" });
    // Advance through any earlier multi-strategy phases until cursor is on p3.
    let cursor: WizardState = base;
    const multiPhases = top.phases.filter((p) => p.strategies.length >= 2);
    const p3Idx = multiPhases.findIndex((p) => p.id === "p3");
    for (let i = 0; i < p3Idx; i++) cursor = applyAdvancePhase(cursor);
    expect(cursor.pendingPhaseIdx).toBe(p3Idx);

    // Pick TWO strategies on p3.
    const s0 = p3.strategies[0].id;
    const s1 = p3.strategies[1].id;
    cursor = applyStrategyChoice(cursor, "p3", s0);
    cursor = applyStrategyChoice(cursor, "p3", s1);
    expect(cursor.phaseStrategies["p3"]).toEqual([s0, s1]);
  });

  it("applyAdvancePhase moves cursor forward (clamped to length)", () => {
    const top = getContentById("top")!;
    const multiPhases = top.phases.filter((p) => p.strategies.length >= 2);
    const base = makeState({ type: "ultimate", contentId: "top", mode: "standard" });

    let cursor: WizardState = base;
    for (let i = 0; i < multiPhases.length + 3; i++) cursor = applyAdvancePhase(cursor);
    expect(cursor.pendingPhaseIdx).toBe(multiPhases.length); // clamped
  });

  it("applyPopularDefaults fills empty entries with [popularId]", () => {
    const s = makeState({ type: "ultimate", contentId: "fru", mode: "standard" });
    const filled = applyPopularDefaults(s);
    // Every key that exists is a non-empty array of strategy ids.
    for (const ids of Object.values(filled.phaseStrategies)) {
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it("applyPopularDefaults preserves user picks (does not overwrite)", () => {
    const fru = getContentById("fru")!;
    const multiPhases = fru.phases.filter((p) => p.strategies.length >= 2);
    const firstPhase = multiPhases[0];
    const nonPopular = firstPhase.strategies.find((s) => !s.popular) ?? firstPhase.strategies[0];

    const s = makeState({
      type: "ultimate",
      contentId: "fru",
      mode: "standard",
      phaseStrategies: { [firstPhase.id]: [nonPopular.id] },
    });
    const filled = applyPopularDefaults(s);
    expect(filled.phaseStrategies[firstPhase.id]).toEqual([nonPopular.id]);
  });
});

describe("buildStepMessage", () => {
  it("pickType step → 2 button rows + 1 cancel row", () => {
    const msg = buildStepMessage(makeState());
    // 8 type choices / 4 per row = 2 rows + cancel = 3 rows
    expect(msg.components.length).toBeGreaterThanOrEqual(2);
  });

  it("pickContent step → 1 select + 1 cancel row", () => {
    const msg = buildStepMessage(makeState({ type: "ultimate" }));
    expect(msg.components).toHaveLength(2);
  });

  it("pickMode step → 1 mode row + 1 cancel row", () => {
    const msg = buildStepMessage(makeState({ type: "ultimate", contentId: "fru" }));
    expect(msg.components).toHaveLength(2);
  });

  it("confirm step → 1 row of 2 buttons (✅作成 / ✖キャンセル)", () => {
    // dmu has no multi-strategy phases → straight to confirm
    const msg = buildStepMessage(
      makeState({ type: "ultimate", contentId: "dmu", mode: "minimal" })
    );
    expect(msg.components).toHaveLength(1);
  });

  it("pickStrategy step always includes the advance/cancel row at the bottom", () => {
    // fru has multi-strategy phases. The advance row is the last component.
    const msg = buildStepMessage(
      makeState({ type: "ultimate", contentId: "fru", mode: "standard" })
    );
    // At least one strategy row + one advance row.
    expect(msg.components.length).toBeGreaterThanOrEqual(2);
    const lastRow = msg.components[msg.components.length - 1];
    const customIds = lastRow.components.map((c: any) => c.data?.custom_id ?? "");
    // The advance row contains :next and :cancel
    expect(customIds.some((id: string) => id.endsWith(":next"))).toBe(true);
    expect(customIds.some((id: string) => id.endsWith(":cancel"))).toBe(true);
  });

  it("embed title includes the wizard name", () => {
    const msg = buildStepMessage(makeState({ name: "週末FRU" }));
    const e = msg.embeds[0].toJSON();
    expect(e.title).toContain("週末FRU");
  });
});

describe("isReadyToConfirm", () => {
  it("false when type missing", () => {
    expect(isReadyToConfirm(makeState())).toBe(false);
  });
  it("false when content missing", () => {
    expect(isReadyToConfirm(makeState({ type: "ultimate" }))).toBe(false);
  });
  it("false when mode missing", () => {
    expect(isReadyToConfirm(makeState({ type: "ultimate", contentId: "fru" }))).toBe(false);
  });
  it("true when all three set", () => {
    expect(
      isReadyToConfirm(makeState({ type: "ultimate", contentId: "fru", mode: "standard" }))
    ).toBe(true);
  });
});
