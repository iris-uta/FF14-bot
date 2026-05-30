import { eq } from "drizzle-orm";
import { contentLifecycle, type ContentLifecycle } from "@ff14kotei/db";
import type { ContentStatus } from "@ff14kotei/schema";
import { getDb } from "../lib/db";

/**
 * Runtime lifecycle overrides set from the admin dashboard.
 *
 * The YAML `status` is the declarative seed; a row here is a sparse exception
 * (see packages/db `content_lifecycle`). These are read on every effective-status
 * resolution in lib/contents.ts (uncached) so a dashboard toggle is reflected on
 * the next interaction without a redeploy. Mirrors the service-layer DB helper
 * style used by vote.ts / static-info.ts (getDb() + drizzle, no helpers in packages/db).
 */

/** All current overrides (for the dashboard table). */
export function listLifecycleOverrides(): ContentLifecycle[] {
  return getDb().select().from(contentLifecycle).all();
}

/** contentId → overridden status, for merging into the content list. */
export function getLifecycleOverrideMap(): Map<string, ContentStatus> {
  return new Map(
    getDb()
      .select()
      .from(contentLifecycle)
      .all()
      .map((r) => [r.contentId, r.status as ContentStatus])
  );
}

/** Set (or replace) the lifecycle override for a content. Upsert on contentId. */
export function setLifecycleOverride(
  contentId: string,
  status: ContentStatus,
  updatedBy?: string
): void {
  const now = Date.now();
  getDb()
    .insert(contentLifecycle)
    .values({ contentId, status, updatedAt: now, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: contentLifecycle.contentId,
      set: { status, updatedAt: now, updatedBy: updatedBy ?? null },
    })
    .run();
}

/** Remove a content's override → it reverts to the YAML seed. */
export function clearLifecycleOverride(contentId: string): void {
  getDb().delete(contentLifecycle).where(eq(contentLifecycle.contentId, contentId)).run();
}
