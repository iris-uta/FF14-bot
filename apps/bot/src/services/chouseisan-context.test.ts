import { describe, it, expect, beforeEach } from "vitest";
import {
  putChouseisanContext,
  takeChouseisanContext,
  peekChouseisanContext,
  clearAllChouseisanContexts,
  pruneNow,
  type ChouseisanContext,
} from "./chouseisan-context";

function makeCtx(overrides: Partial<ChouseisanContext> = {}): ChouseisanContext {
  return {
    eventName: "test event",
    candidates: [],
    channelId: "c1",
    guildId: "g1",
    staticId: null,
    mention: null,
    notifyMinutesBefore: 10,
    defaultTime: null,
    creatorId: "u1",
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => clearAllChouseisanContexts());

describe("chouseisan-context", () => {
  it("put + peek returns the same context", () => {
    putChouseisanContext("a", makeCtx({ eventName: "next-fri" }));
    expect(peekChouseisanContext("a")?.eventName).toBe("next-fri");
  });

  it("take removes the context", () => {
    putChouseisanContext("a", makeCtx());
    expect(takeChouseisanContext("a")?.eventName).toBe("test event");
    expect(takeChouseisanContext("a")).toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(peekChouseisanContext("missing")).toBeNull();
    expect(takeChouseisanContext("missing")).toBeNull();
  });

  it("expires contexts older than 15 min on pruneNow", () => {
    const base = Date.now();
    putChouseisanContext("old", makeCtx({ createdAt: base - 16 * 60_000 }));
    putChouseisanContext("recent", makeCtx({ createdAt: base }));
    pruneNow(base);
    expect(peekChouseisanContext("old")).toBeNull();
    expect(peekChouseisanContext("recent")).not.toBeNull();
  });
});
