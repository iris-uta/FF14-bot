/**
 * Orchestrate Sheet → YAML sync:
 *   1. fetch all 9 tabs as CSV
 *   2. parse rows
 *   3. assemble Content[] (Zod validated)
 *   4. write/diff YAML files
 *   5. return a summary the CLI can print
 */
import { parseCsvWithHeader } from "./csv.js";
import { fetchSheetTabAsCsv } from "./sheet-fetcher.js";
import { assembleContents, TAB_NAMES, type AssembleError } from "./assemble.js";
import { writeContentYaml, type WriteResult } from "./yaml-writer.js";

export interface PullOptions {
  sheetId: string;
  contentsDir: string;
  dryRun?: boolean;
  /** Inject a fetch impl for testing. */
  fetchFn?: typeof fetch;
}

export interface PullSummary {
  fetched: Record<keyof typeof TAB_NAMES, number>;  // row counts
  results: WriteResult[];
  assembleErrors: AssembleError[];
}

export async function syncFromSheet(options: PullOptions): Promise<PullSummary> {
  const { sheetId, contentsDir, dryRun, fetchFn } = options;

  const tabs = await fetchAllTabs(sheetId, fetchFn);

  const summary: PullSummary = {
    fetched: {
      contents: tabs.contents.length,
      phases: tabs.phases.length,
      videos: tabs.videos.length,
      mitigations: tabs.mitigations.length,
      strategies: tabs.strategies.length,
      tips: tabs.tips.length,
      macros: tabs.macros.length,
      templates: tabs.templates.length,
    },
    results: [],
    assembleErrors: [],
  };

  const { contents, errors } = assembleContents(tabs);
  summary.assembleErrors = errors;

  for (const content of contents) {
    const result = writeContentYaml(content, contentsDir, { dryRun });
    summary.results.push(result);
  }

  return summary;
}

async function fetchAllTabs(
  sheetId: string,
  fetchFn?: typeof fetch
): Promise<{
  contents: Record<string, string>[];
  phases: Record<string, string>[];
  videos: Record<string, string>[];
  mitigations: Record<string, string>[];
  strategies: Record<string, string>[];
  tips: Record<string, string>[];
  macros: Record<string, string>[];
  templates: Record<string, string>[];
}> {
  const fetchTab = async (name: string) => {
    const csv = await fetchSheetTabAsCsv(sheetId, name, fetchFn);
    return parseCsvWithHeader(csv);
  };

  // Fetch concurrently to keep wall time low (gviz tolerates parallel reads)
  const [
    contents, phases, videos, mitigations, strategies, tips, macros, templates,
  ] = await Promise.all([
    fetchTab(TAB_NAMES.contents),
    fetchTab(TAB_NAMES.phases),
    fetchTab(TAB_NAMES.videos),
    fetchTab(TAB_NAMES.mitigations),
    fetchTab(TAB_NAMES.strategies),
    fetchTab(TAB_NAMES.tips),
    fetchTab(TAB_NAMES.macros),
    fetchTab(TAB_NAMES.templates),
  ]);

  return { contents, phases, videos, mitigations, strategies, tips, macros, templates };
}
