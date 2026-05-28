/**
 * CLI: pull content data from Google Sheets and write to data/contents/*.yaml
 *
 * Usage:
 *   pnpm --filter @ff14kotei/content-sync pull
 *   pnpm --filter @ff14kotei/content-sync pull -- --dry-run
 *
 * Env:
 *   CONTENT_SHEET_ID      — Google Sheet ID (required, from the sheet URL)
 *   CONTENTS_DIR          — path to data/contents (default: repo-root/data/contents)
 *
 * The sheet must be shared as "Anyone with the link can view" — no service
 * account needed. See docs/content-sync.md for setup.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncFromSheet } from "../sync-pull.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const DEFAULT_CONTENTS_DIR = resolve(REPO_ROOT, "data/contents");

async function main() {
  const sheetId = process.env.CONTENT_SHEET_ID;
  if (!sheetId) {
    console.error("ERROR: CONTENT_SHEET_ID env var is required.");
    console.error("  Get it from the sheet URL: https://docs.google.com/spreadsheets/d/<THIS_PART>/...");
    console.error("  See docs/content-sync.md for setup.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");
  const contentsDir = process.env.CONTENTS_DIR ?? DEFAULT_CONTENTS_DIR;

  console.log(`Sheet ID:     ${sheetId}`);
  console.log(`Output dir:   ${contentsDir}`);
  console.log(`Mode:         ${dryRun ? "DRY-RUN (no files written)" : "WRITE"}`);
  console.log("");

  let summary;
  try {
    summary = await syncFromSheet({ sheetId, contentsDir, dryRun });
  } catch (err) {
    console.error("Pull failed:", err);
    process.exit(2);
  }

  console.log("── Fetched rows ──");
  for (const [tab, count] of Object.entries(summary.fetched)) {
    console.log(`  ${tab.padEnd(12)} ${count}`);
  }
  console.log("");

  console.log("── Results ──");
  const counts = { created: 0, updated: 0, unchanged: 0, "would-create": 0, "would-update": 0 };
  for (const r of summary.results) {
    counts[r.status]++;
    if (r.status !== "unchanged") {
      console.log(`  ${statusEmoji(r.status)} ${r.status.padEnd(14)} ${r.path}`);
    }
  }
  console.log("");
  console.log(`Summary: ${summarize(counts)}`);

  if (summary.assembleErrors.length > 0) {
    console.error("");
    console.error("⚠️  Assembly errors (these contents were skipped):");
    for (const e of summary.assembleErrors) {
      console.error(`  ❌ ${e.contentId}: ${e.message}`);
    }
    process.exit(3);
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case "created":      return "✨";
    case "updated":      return "🔧";
    case "unchanged":    return "  ";
    case "would-create": return "🆕";
    case "would-update": return "📝";
    default:             return "❓";
  }
}

function summarize(c: Record<string, number>): string {
  const parts: string[] = [];
  if (c.created)        parts.push(`${c.created} created`);
  if (c.updated)        parts.push(`${c.updated} updated`);
  if (c.unchanged)      parts.push(`${c.unchanged} unchanged`);
  if (c["would-create"]) parts.push(`${c["would-create"]} would-create`);
  if (c["would-update"]) parts.push(`${c["would-update"]} would-update`);
  return parts.join(", ") || "no contents";
}

main();
