import { resolve } from "node:path";
import { loadAllContents, isContentPublished, type Content } from "@ff14kotei/schema";

const CONTENTS_DIR = resolve(process.cwd(), "../../data/contents");

// Raw cache = every content on disk (published + testing).
let cache: Content[] | null = null;

function getRawContents(): Content[] {
  if (cache === null) {
    cache = loadAllContents(CONTENTS_DIR);
  }
  return cache;
}

/**
 * Contents visible to normal bot users (published only).
 * Every user-facing picker (autocomplete / setup wizard / static-init /
 * recruit-template) funnels through here, so testing content is hidden
 * everywhere with no per-call-site filtering.
 */
export function getAllContents(): Content[] {
  return getRawContents().filter(isContentPublished);
}

/**
 * Every content including `status: testing` ones.
 * For backend / admin contexts only (e.g. `/dev-test` bulk-create, startup log).
 * Do NOT use this for user-facing lists.
 */
export function getAllContentsIncludingTesting(): Content[] {
  return getRawContents();
}

/**
 * Resolve a content by id — returns testing content too.
 * Resolution-by-id is always allowed (existing statics must keep auto-detecting
 * their content, even if it was created for a testing content via `/dev-test`).
 */
export function getContentById(id: string): Content | undefined {
  return getRawContents().find((c) => c.id === id);
}

export function reloadContents(): void {
  cache = null;
}
