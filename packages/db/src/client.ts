import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import * as schema from "./schema";

export type DbClient = BetterSQLite3Database<typeof schema>;

export interface CreateDbOptions {
  /**
   * Path to the SQLite file. Use `:memory:` for in-memory (tests).
   * Default: env DATABASE_URL or `./data/ff14kotei.db`
   */
  path?: string;
  /** Run migrations on connect. Default true. */
  autoMigrate?: boolean;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_FOLDER = resolve(HERE, "../drizzle");

/**
 * Max time (ms) to wait for a held migration lock before giving up.
 * A migration normally takes < 1 second; this is generous to allow a deploy
 * race to resolve without immediately failing.
 */
const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_MS = 200;
const LOCK_STALE_MS = 120_000;  // older than 2 min → assume crashed, override

export function createDb(options: CreateDbOptions = {}): DbClient {
  const path = options.path ?? process.env.DATABASE_URL ?? "./data/ff14kotei.db";

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // ── Memory-conscious pragmas (256 MB Fly machine target) ────────────────
  //
  // Defaults assume "give me the world for speed". On a tiny VM we'd rather
  // give back a few MB to discord.js + node heap:
  //
  // cache_size: page cache in KiB (negative). -2000 = 2 MiB page cache, plenty
  // for our schema (~12 tables, small indexes). Default is -2000 already on
  // most builds but we pin it for portability.
  //
  // mmap_size: 0 disables memory-mapped I/O. The mmap was nice on big DBs but
  // for our 3-10 MB DB it just bloats the resident memory without measurable
  // win — read() is fine.
  //
  // journal_size_limit: bound the WAL file. Default unlimited (can grow to
  // hundreds of MB under load). 1 MiB is generous for our write rate (<10/s).
  //
  // synchronous = NORMAL pairs with WAL — safe on power loss, faster than
  // FULL (default) with no real downside on a Fly volume.
  sqlite.pragma("cache_size = -2000");
  sqlite.pragma("mmap_size = 0");
  sqlite.pragma("journal_size_limit = 1048576");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });

  if (options.autoMigrate !== false) {
    runMigrationsWithLock(db, path);
  }

  return db;
}

/**
 * Run migrations with a sentinel-file advisory lock (B6 audit fix).
 *
 * Why:
 *   On Fly.io rolling deploys (or any 2-process race), two processes could
 *   both try to migrate the SAME SQLite file at the same time. Drizzle's
 *   migrator updates an internal `__drizzle_migrations` table without any
 *   coordination; a race can corrupt it.
 *
 * What this does:
 *   - Before migrating, write a lockfile `<db>.migrate.lock` with pid+timestamp
 *   - If lockfile already exists AND is recent (< 2min), wait up to 30s for
 *     the other process to release it
 *   - If lockfile is stale (> 2min), assume the previous holder crashed and
 *     take over (log a warning)
 *   - Always remove the lockfile in finally{}, even on migration failure
 *
 * For `:memory:` DBs (tests) we skip this entirely since there's no file
 * to coordinate over.
 */
function runMigrationsWithLock(db: DbClient, dbPath: string): void {
  // No lock needed for in-memory DBs (tests)
  if (dbPath === ":memory:") {
    migrate(db, { migrationsFolder: DEFAULT_MIGRATIONS_FOLDER });
    return;
  }

  const lockPath = `${dbPath}.migrate.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;

  // Wait for any existing lock to clear (or expire as stale)
  while (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lockData = JSON.parse(content) as { pid: number; at: number };
      const age = Date.now() - lockData.at;
      if (age > LOCK_STALE_MS) {
        console.warn(
          `[db] removing stale migration lock from pid ${lockData.pid} (age ${Math.round(age / 1000)}s)`
        );
        try { unlinkSync(lockPath); } catch { /* race — another process won, will catch below */ }
        break;
      }
    } catch {
      // Corrupt lockfile — treat as stale
      try { unlinkSync(lockPath); } catch { /* ignore */ }
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `[db] migration lock held longer than ${LOCK_WAIT_MS / 1000}s at ${lockPath}; aborting`
      );
    }
    // Synchronous sleep (we're in startup, no event loop work to defer)
    const start = Date.now();
    while (Date.now() - start < LOCK_POLL_MS) { /* spin */ }
  }

  // Acquire lock
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "w" });

  try {
    migrate(db, { migrationsFolder: DEFAULT_MIGRATIONS_FOLDER });
  } finally {
    try { unlinkSync(lockPath); } catch (err) {
      console.warn(`[db] failed to remove migration lock ${lockPath}:`, err);
    }
  }
}
