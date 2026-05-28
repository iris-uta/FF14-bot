/**
 * Disassemble Content objects into the 9 flat sheet tabs.
 * Inverse of assemble.ts.
 *
 * Used by:
 *  - export-csv CLI (writes local CSV files for one-time import to Sheets)
 *  - future push CLI (writes to Google Sheets API)
 */
import type { Content } from "@ff14kotei/schema";
import type { SheetData } from "./assemble.js";

export function disassembleContents(contents: Content[]): SheetData {
  const out: SheetData = {
    contents: [],
    phases: [],
    videos: [],
    mitigations: [],
    strategies: [],
    tips: [],
    macros: [],
    templates: [],
    references: [],
  };

  // Sort by patch + id so rows have a stable order (helps git diffs after re-export)
  const sorted = [...contents].sort((a, b) => {
    const pa = patchKey(a.patch);
    const pb = patchKey(b.patch);
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  for (const c of sorted) {
    out.contents.push({
      id: c.id,
      displayName: c.displayName,
      shortName: c.shortName,
      type: c.type,
      patch: c.patch ?? "",
      references_primary: c.references.primary ?? "",
    });

    for (const phase of c.phases) {
      out.phases.push({
        content_id: c.id,
        phase_id: phase.id,
        name: phase.name,
        order: String(phase.order),
        description: phase.description ?? "",
      });
      for (const v of phase.videos) {
        out.videos.push({
          content_id: c.id,
          phase_id: phase.id,
          title: v.title,
          url: v.url,
          author: v.author ?? "",
        });
      }
      if (phase.mitigation) {
        out.mitigations.push({
          content_id: c.id,
          phase_id: phase.id,
          name: phase.mitigation.name,
          url: phase.mitigation.url,
          copyable: phase.mitigation.copyable ? "true" : "false",
        });
      }
      for (const s of phase.strategies) {
        out.strategies.push({
          content_id: c.id,
          phase_id: phase.id,
          id: s.id,
          name: s.name,
          description: s.description ?? "",
        });
      }
      for (const tip of phase.tips) {
        out.tips.push({
          content_id: c.id,
          phase_id: phase.id,
          tip,
        });
      }
    }

    for (const m of c.macros) {
      out.macros.push({
        content_id: c.id,
        source: m.source,
        url: m.url,
        text: m.text ?? "",
      });
    }
    for (const t of c.recruitmentTemplates) {
      out.templates.push({
        content_id: c.id,
        template: t.template,
        variables: (t.variables ?? []).join(", "),
      });
    }
    for (const url of c.references.urls) {
      out.references.push({ content_id: c.id, url });
    }
  }

  return out;
}

/** Sort key: 7.11 → 711, 6.31 → 631, missing → Infinity (sort to end) */
function patchKey(p: string | undefined): number {
  if (!p) return Number.POSITIVE_INFINITY;
  const parts = p.split(".").map((s) => Number.parseInt(s, 10) || 0);
  return parts[0] * 1000 + (parts[1] ?? 0) * 10 + (parts[2] ?? 0);
}

// ── CSV serialization (inverse of csv.parseCsvWithHeader) ───────────────────

/**
 * Serialize array of {column: value} objects to CSV text.
 * - First row is the header (union of keys across rows, sorted)
 * - Newlines/commas in values get double-quoted, embedded quotes escaped
 */
export function rowsToCsv(rows: Record<string, string>[], headerOrder?: string[]): string {
  if (rows.length === 0) return headerOrder ? headerOrder.join(",") + "\n" : "";
  const headers = headerOrder ?? collectHeaders(rows);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function collectHeaders(rows: Record<string, string>[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

function escapeCsvCell(value: string): string {
  if (value === "") return "";
  const needsQuote = /[",\r\n]/.test(value);
  if (!needsQuote) return value;
  return '"' + value.replace(/"/g, '""') + '"';
}

// ── Header order (matches the documented sheet schema) ──────────────────────

export const TAB_HEADERS: Record<keyof SheetData, string[]> = {
  contents:    ["id", "displayName", "shortName", "type", "patch", "references_primary"],
  phases:      ["content_id", "phase_id", "name", "order", "description"],
  videos:      ["content_id", "phase_id", "title", "url", "author"],
  mitigations: ["content_id", "phase_id", "name", "url", "copyable"],
  strategies:  ["content_id", "phase_id", "id", "name", "description"],
  tips:        ["content_id", "phase_id", "tip"],
  macros:      ["content_id", "source", "url", "text"],
  templates:   ["content_id", "template", "variables"],
  references:  ["content_id", "url"],
};
