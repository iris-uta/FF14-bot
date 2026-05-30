import { resolve } from "node:path";
import { loadAllContents, isContentPublished, type Content, type ContentStatus } from "@ff14kotei/schema";
import { getLifecycleOverrideMap } from "../services/content-lifecycle";

const CONTENTS_DIR = resolve(process.cwd(), "../../data/contents");

// YAML parse cache — the on-disk content is immutable at runtime (baked into the
// deploy image), so parsing N files is done once. Lifecycle overrides are NOT
// cached here (see getEffectiveContents).
let cache: Content[] | null = null;

function getYamlContents(): Content[] {
  if (cache === null) {
    cache = loadAllContents(CONTENTS_DIR);
  }
  return cache;
}

/** YAML seed → a concrete lifecycle status (省略 = active). */
function yamlSeed(c: Content): ContentStatus {
  return c.status ?? "active";
}

/**
 * Every content with its EFFECTIVE lifecycle status applied:
 *   DB override ?? YAML seed ?? "active".
 *
 * The override read is intentionally NOT cached: a dashboard toggle writes the
 * `content_lifecycle` table and the very next call must reflect it. The cost is
 * one tiny `SELECT * FROM content_lifecycle` (0–few rows) per call — orders of
 * magnitude cheaper than the YAML parse, and only at user-interaction rate.
 * Objects are copied only when the effective status actually differs, so the
 * cached YAML objects are never mutated.
 */
function getEffectiveContents(): Content[] {
  const overrides = getLifecycleOverrideMap();
  return getYamlContents().map((c) => {
    const eff = overrides.get(c.id) ?? yamlSeed(c);
    return eff === c.status ? c : { ...c, status: eff };
  });
}

/**
 * Contents visible to normal bot users (active only — testing/inactive hidden).
 * Every user-facing picker (autocomplete / setup wizard / static-init /
 * recruit-template) funnels through here, so testing & inactive content is
 * hidden everywhere with no per-call-site filtering.
 */
export function getAllContents(): Content[] {
  return getEffectiveContents().filter(isContentPublished);
}

/**
 * Every content including `testing` / `inactive` ones.
 * For backend / admin contexts only (`/dev-test` bulk-create, admin dashboard,
 * startup log). Do NOT use this for user-facing lists.
 */
export function getAllContentsIncludingTesting(): Content[] {
  return getEffectiveContents();
}

/**
 * Resolve a content by id — returns testing/inactive content too, with the
 * effective lifecycle status applied. Resolution-by-id is always allowed (existing
 * statics must keep auto-detecting their content even if it was toggled to
 * testing/inactive or created via `/dev-test`).
 */
export function getContentById(id: string): Content | undefined {
  return getEffectiveContents().find((c) => c.id === id);
}

/**
 * The effective lifecycle status of a single content (override ?? seed),
 * or undefined if the id is unknown. Used by the dashboard / metrics.
 */
export function getEffectiveStatus(id: string): ContentStatus | undefined {
  const c = getYamlContents().find((x) => x.id === id);
  if (!c) return undefined;
  return getLifecycleOverrideMap().get(id) ?? yamlSeed(c);
}

export function reloadContents(): void {
  cache = null; // only the YAML cache; overrides are always read live from the DB
}
