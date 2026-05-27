import { createDb, type DbClient } from "@ff14kotei/db";
import { resolve } from "node:path";

/**
 * Web app DB connection — reads from the **same SQLite file as the bot**.
 *
 * Single-writer (bot) + multiple-readers (web) is safe in WAL mode
 * (already enabled in @ff14kotei/db client). For production a Postgres
 * migration is planned, but for localhost dev this works fine.
 *
 * Path resolution:
 *  - DATABASE_URL env var if set (preferred for non-default deployments)
 *  - else: `<repo>/apps/bot/data/ff14kotei.db` resolved from web app cwd
 *    (web runs from apps/web; bot's data dir is one level up + one over)
 *
 * Migrations: skipped here (autoMigrate: false). The bot is the migration owner;
 * the web app should never apply migrations.
 */

let cached: DbClient | null = null;

function resolveDbPath(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // apps/web/ -> ../bot/data/ff14kotei.db (default bot path)
  return resolve(process.cwd(), "../bot/data/ff14kotei.db");
}

export function getDb(): DbClient {
  if (!cached) {
    cached = createDb({ path: resolveDbPath(), autoMigrate: false });
  }
  return cached;
}
