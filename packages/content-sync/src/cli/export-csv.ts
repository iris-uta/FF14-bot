/**
 * CLI: read all data/contents/*.yaml and write 9 CSV files for Google Sheets seed.
 *
 * Usage:
 *   pnpm --filter @ff14kotei/content-sync export-csv
 *
 * Output: data/sheet-export/{contents,phases,videos,...}.csv (9 files)
 *
 * A multi-tab XLSX template (`ff14-contents-template.xlsx`) is also checked
 * into the same dir — see data/sheet-export/README.md for one-shot import.
 *
 * What to do with the output:
 *   - **Recommended**: import `ff14-contents-template.xlsx` into a new Google
 *     Sheet (File → Import → Replace) — all 9 tabs created in one step
 *   - Or import each CSV one-by-one
 *   - Share the sheet "Anyone with the link can view"
 *   - Use `pnpm pull` for subsequent edits
 */
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ContentSchema, type Content } from "@ff14kotei/schema";
import { disassembleContents, rowsToCsv, TAB_HEADERS } from "../disassemble.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const DEFAULT_CONTENTS_DIR = resolve(REPO_ROOT, "data/contents");
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, "data/sheet-export");

function main(): void {
  const contentsDir = process.env.CONTENTS_DIR ?? DEFAULT_CONTENTS_DIR;
  const outputDir = process.env.OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

  console.log(`Input:  ${contentsDir}`);
  console.log(`Output: ${outputDir}`);
  console.log("");

  // Load + validate all YAML files
  const contents = loadAllContents(contentsDir);
  console.log(`Loaded ${contents.length} content(s)`);

  // Disassemble into 9 flat tabs
  const sheetData = disassembleContents(contents);

  // Write each tab as a CSV
  mkdirSync(outputDir, { recursive: true });
  let totalRows = 0;
  for (const [tab, headers] of Object.entries(TAB_HEADERS) as [keyof typeof TAB_HEADERS, string[]][]) {
    const rows = sheetData[tab];
    const csv = rowsToCsv(rows, headers);
    const path = join(outputDir, `${tab}.csv`);
    writeFileSync(path, csv, "utf-8");
    totalRows += rows.length;
    console.log(`  ${tab.padEnd(12)} ${String(rows.length).padStart(4)} rows → ${path}`);
  }
  console.log("");
  console.log(`Total: ${totalRows} rows across 9 tabs`);
  console.log("");
  console.log("Next: import each CSV into a Google Sheet tab.");
  console.log("  See docs/content-sync.md for the full setup walkthrough.");
}

function loadAllContents(dir: string): Content[] {
  const files = readdirSync(dir).filter(
    (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_")
  );
  const result: Content[] = [];
  for (const f of files) {
    const path = join(dir, f);
    const raw = readFileSync(path, "utf-8");
    const parsed = parseYaml(raw);
    const validated = ContentSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(`❌ ${f}: validation failed — skipping`);
      console.error(JSON.stringify(validated.error.format(), null, 2).slice(0, 500));
      continue;
    }
    result.push(validated.data);
  }
  return result;
}

main();
