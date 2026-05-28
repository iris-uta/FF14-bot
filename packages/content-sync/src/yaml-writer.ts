/**
 * Write a Content object to its YAML file in data/contents/<id>.yaml.
 *
 * The YAML format favors readability for human editing:
 *  - flow level: 0 (block style everywhere — no inline arrays)
 *  - line width: 100 (keep lines fitting in a normal editor)
 *  - quotes: single by default, double when needed (consistent with current files)
 *  - keys in stable order matching the schema definition
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { Content } from "@ff14kotei/schema";

export interface WriteOptions {
  /** Don't actually write; just compute what would change. */
  dryRun?: boolean;
}

export interface WriteResult {
  path: string;
  status: "created" | "updated" | "unchanged" | "would-create" | "would-update";
  diff?: { before: string; after: string };
}

export function writeContentYaml(
  content: Content,
  contentsDir: string,
  options: WriteOptions = {}
): WriteResult {
  const path = join(contentsDir, `${content.id}.yaml`);

  // Re-order keys so the YAML output is predictable + human-friendly
  const ordered = orderContentKeys(content);
  const yaml = stringifyYaml(ordered, {
    indent: 2,
    lineWidth: 100,
    singleQuote: false,            // YAML strings default to plain/double quotes per yaml lib
    minContentWidth: 20,
  });

  const exists = existsSync(path);
  const existing = exists ? readFileSync(path, "utf-8") : "";
  const unchanged = exists && existing === yaml;

  if (options.dryRun) {
    return {
      path,
      status: unchanged ? "unchanged" : exists ? "would-update" : "would-create",
      diff: unchanged ? undefined : { before: existing, after: yaml },
    };
  }

  if (unchanged) return { path, status: "unchanged" };

  writeFileSync(path, yaml, "utf-8");
  return {
    path,
    status: exists ? "updated" : "created",
    diff: { before: existing, after: yaml },
  };
}

/**
 * Re-order keys to match the canonical YAML field order seen in data/contents/.
 * Skips keys that are empty arrays/objects to keep the YAML compact.
 */
function orderContentKeys(c: Content): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.id = c.id;
  out.displayName = c.displayName;
  out.shortName = c.shortName;
  out.type = c.type;
  if (c.patch) out.patch = c.patch;
  out.phases = c.phases.map((p) => orderPhaseKeys(p));
  if (c.macros.length > 0) out.macros = c.macros;
  if (c.recruitmentTemplates.length > 0) out.recruitmentTemplates = c.recruitmentTemplates;
  if (c.overview) out.overview = c.overview;
  return out;
}

function orderPhaseKeys(p: Content["phases"][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.id = p.id;
  out.name = p.name;
  out.order = p.order;
  if (p.popularStrategy) out.popularStrategy = p.popularStrategy;
  if (p.description) out.description = p.description;
  if (p.videos.length > 0) out.videos = p.videos;
  if (p.mitigation) out.mitigation = p.mitigation;
  if (p.strategies.length > 0) out.strategies = p.strategies;
  if (p.tips.length > 0) out.tips = p.tips;
  return out;
}
