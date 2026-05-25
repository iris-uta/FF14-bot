import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
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

export function createDb(options: CreateDbOptions = {}): DbClient {
  const path = options.path ?? process.env.DATABASE_URL ?? "./data/ff14kotei.db";

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  if (options.autoMigrate !== false) {
    migrate(db, { migrationsFolder: DEFAULT_MIGRATIONS_FOLDER });
  }

  return db;
}
