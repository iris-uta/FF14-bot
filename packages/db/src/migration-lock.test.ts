import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createDb } from "./client";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "ff14-db-lock-"));
});

afterEach(() => {
  try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("migration lock (B6)", () => {
  it("creates DB + applies migrations + removes lockfile when none exists", () => {
    const dbPath = join(workDir, "test.db");
    const lockPath = `${dbPath}.migrate.lock`;
    expect(existsSync(lockPath)).toBe(false);

    const db = createDb({ path: dbPath });
    expect(db).toBeDefined();
    // Lock file should be removed after migration completes
    expect(existsSync(lockPath)).toBe(false);
    // DB file exists
    expect(existsSync(dbPath)).toBe(true);
  });

  it("removes stale lockfile (older than 2 min) and proceeds", () => {
    const dbPath = join(workDir, "test.db");
    const lockPath = `${dbPath}.migrate.lock`;
    // Create staircase first so dirname exists
    createDb({ path: dbPath });
    // Now write a stale lock (3 min old) and re-create
    const staleAt = Date.now() - 3 * 60_000;
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, at: staleAt }));
    expect(existsSync(lockPath)).toBe(true);

    // Should proceed (and log a warning, which we don't assert on)
    const db = createDb({ path: dbPath });
    expect(db).toBeDefined();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("removes corrupt lockfile and proceeds", () => {
    const dbPath = join(workDir, "test.db");
    const lockPath = `${dbPath}.migrate.lock`;
    createDb({ path: dbPath });
    writeFileSync(lockPath, "this-is-not-json");

    const db = createDb({ path: dbPath });
    expect(db).toBeDefined();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("skips locking entirely for :memory: DBs", () => {
    // Mostly a smoke test — :memory: shouldn't try to create files
    const db = createDb({ path: ":memory:" });
    expect(db).toBeDefined();
    // No lock file to assert about — just confirm no crash
  });

  it("autoMigrate=false skips both migration and lock entirely", () => {
    const dbPath = join(workDir, "no-migrate.db");
    const lockPath = `${dbPath}.migrate.lock`;
    const db = createDb({ path: dbPath, autoMigrate: false });
    expect(db).toBeDefined();
    expect(existsSync(lockPath)).toBe(false);
  });
});
