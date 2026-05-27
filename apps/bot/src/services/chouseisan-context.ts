/**
 * Short-lived in-memory store for /from-chouseisan select-menu state.
 *
 * Why not DB? The selection is a fast user interaction (within ~minutes).
 * If the bot restarts the select menu is dead anyway (the message context is lost).
 * Memory only, 15-minute TTL.
 */
import type { ChouseisanCandidate } from "./chouseisan-csv";

const TTL_MS = 15 * 60_000;

export interface ChouseisanContext {
  eventName: string;
  candidates: ChouseisanCandidate[];
  channelId: string | null;
  guildId: string;
  staticId: string | null;
  mention: string | null;
  notifyMinutesBefore: number;
  defaultTime: string | null;     // "HH:mm" or null
  creatorId: string;
  createdAt: number;
}

const store = new Map<string, ChouseisanContext>();

export function putChouseisanContext(id: string, ctx: ChouseisanContext): void {
  prune();
  store.set(id, ctx);
}

export function takeChouseisanContext(id: string): ChouseisanContext | null {
  prune();
  const v = store.get(id);
  if (!v) return null;
  store.delete(id);
  return v;
}

export function peekChouseisanContext(id: string): ChouseisanContext | null {
  prune();
  return store.get(id) ?? null;
}

export function clearAllChouseisanContexts(): void {
  store.clear();
}

function prune(now: number = Date.now()): void {
  for (const [id, c] of store.entries()) {
    if (now - c.createdAt > TTL_MS) store.delete(id);
  }
}

/** Test-only export to drive pruning. */
export function pruneNow(now: number): void {
  prune(now);
}
