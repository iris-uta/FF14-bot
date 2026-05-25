import { createDb, type DbClient } from "@ff14kotei/db";

let cached: DbClient | null = null;

export function getDb(): DbClient {
  if (cached === null) {
    cached = createDb();
  }
  return cached;
}

/** For tests — replace the cached instance with one backed by `:memory:`. */
export function setDbForTesting(db: DbClient): void {
  cached = db;
}

export function resetDb(): void {
  cached = null;
}
