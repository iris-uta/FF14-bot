import { describe, it, expect, beforeEach } from "vitest";
import {
  putDraft,
  takeDraft,
  peekDraft,
  clearAllDrafts,
  draftCount,
  pruneNow,
  type VoteDraft,
} from "./vote-draft";

const SAMPLE: Omit<VoteDraft, "createdAt"> = {
  guildId: "g",
  channelId: "c",
  creatorId: "u",
  title: "次回固定日",
  closesAt: null,
  mention: null,
  reminderHoursBefore: null,
  staticId: null,
};

beforeEach(() => {
  clearAllDrafts();
});

describe("vote-draft store", () => {
  it("put + peek returns the same draft", () => {
    putDraft("id1", { ...SAMPLE, createdAt: Date.now() });
    const got = peekDraft("id1");
    expect(got?.title).toBe("次回固定日");
    expect(draftCount()).toBe(1);
  });

  it("take removes the draft", () => {
    putDraft("id1", { ...SAMPLE, createdAt: Date.now() });
    const taken = takeDraft("id1");
    expect(taken?.title).toBe("次回固定日");
    expect(draftCount()).toBe(0);
    expect(takeDraft("id1")).toBeNull();
  });

  it("returns null for unknown id", () => {
    expect(peekDraft("missing")).toBeNull();
    expect(takeDraft("missing")).toBeNull();
  });

  it("preserves all fields through round-trip", () => {
    const draft: VoteDraft = {
      ...SAMPLE,
      closesAt: 12345,
      mention: "<@&role-abc>",
      reminderHoursBefore: 12,
      staticId: "static-xyz",
      createdAt: Date.now(), // recent so it doesn't get pruned on read
    };
    putDraft("full", draft);
    const got = takeDraft("full");
    expect(got).toEqual(draft);
  });

  it("expires drafts older than 15 min via pruneNow", () => {
    // Use real "now" as base so peekDraft's internal pruneExpired(Date.now()) cooperates.
    const base = Date.now();
    putDraft("old", { ...SAMPLE, createdAt: base - 16 * 60_000 });
    putDraft("recent", { ...SAMPLE, createdAt: base });
    pruneNow(base);
    expect(peekDraft("old")).toBeNull();
    expect(peekDraft("recent")).not.toBeNull();
  });

  it("keeps drafts younger than 15 min", () => {
    const base = Date.now();
    putDraft("recent", { ...SAMPLE, createdAt: base - 5 * 60_000 });
    pruneNow(base);
    expect(peekDraft("recent")).not.toBeNull();
  });
});
