/**
 * Assemble Content objects from flat sheet rows.
 *
 * Sheet structure (9 tabs):
 *   contents     | id, displayName, shortName, type, patch, references_primary
 *   phases       | content_id, phase_id, name, order, description
 *   videos       | content_id, phase_id, title, url, author
 *   mitigations  | content_id, phase_id, name, url, copyable
 *   strategies   | content_id, phase_id, id, name, description
 *   tips         | content_id, phase_id, tip
 *   macros       | content_id, source, url, text
 *   templates    | content_id, template, variables (CSV)
 *   references   | content_id, url
 *
 * Note: this is the inverse of "current YAML → Sheet" — we read all 9 tabs
 * and stitch them back into the nested Content structure that Zod validates.
 */
import { ContentSchema, type Content } from "@ff14kotei/schema";

export interface SheetData {
  contents: Record<string, string>[];
  phases: Record<string, string>[];
  videos: Record<string, string>[];
  mitigations: Record<string, string>[];
  strategies: Record<string, string>[];
  tips: Record<string, string>[];
  macros: Record<string, string>[];
  templates: Record<string, string>[];
  references: Record<string, string>[];
}

export const TAB_NAMES = {
  contents: "contents",
  phases: "phases",
  videos: "videos",
  mitigations: "mitigations",
  strategies: "strategies",
  tips: "tips",
  macros: "macros",
  templates: "templates",
  references: "references",
} as const;

export interface AssembleError {
  contentId: string;
  message: string;
}

export interface AssembleResult {
  contents: Content[];
  errors: AssembleError[];
}

/**
 * Build a list of Content objects from sheet rows.
 * Invalid contents (failing Zod) are collected into `errors` rather than thrown
 * so a single bad row doesn't lose all the others.
 */
export function assembleContents(data: SheetData): AssembleResult {
  const result: Content[] = [];
  const errors: AssembleError[] = [];

  // Group helpers — index by content_id (and optionally phase_id)
  const phasesByContent = groupBy(data.phases, "content_id");
  const videosByPhase = groupBy(data.videos, (r) => key(r.content_id, r.phase_id));
  const mitByPhase = groupBy(data.mitigations, (r) => key(r.content_id, r.phase_id));
  const stratsByPhase = groupBy(data.strategies, (r) => key(r.content_id, r.phase_id));
  const tipsByPhase = groupBy(data.tips, (r) => key(r.content_id, r.phase_id));
  const macrosByContent = groupBy(data.macros, "content_id");
  const templatesByContent = groupBy(data.templates, "content_id");
  const refsByContent = groupBy(data.references, "content_id");

  for (const row of data.contents) {
    const id = row.id?.trim();
    if (!id) continue; // skip blank rows

    try {
      const candidate = buildContent(
        row,
        phasesByContent[id] ?? [],
        videosByPhase,
        mitByPhase,
        stratsByPhase,
        tipsByPhase,
        macrosByContent[id] ?? [],
        templatesByContent[id] ?? [],
        refsByContent[id] ?? []
      );
      const parsed = ContentSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push({
          contentId: id,
          message: `Zod validation failed: ${formatZodError(parsed.error)}`,
        });
        continue;
      }
      result.push(parsed.data);
    } catch (err) {
      errors.push({
        contentId: id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { contents: result, errors };
}

function buildContent(
  contentRow: Record<string, string>,
  phaseRows: Record<string, string>[],
  videosByPhase: Record<string, Record<string, string>[]>,
  mitByPhase: Record<string, Record<string, string>[]>,
  stratsByPhase: Record<string, Record<string, string>[]>,
  tipsByPhase: Record<string, Record<string, string>[]>,
  macroRows: Record<string, string>[],
  templateRows: Record<string, string>[],
  refRows: Record<string, string>[]
): unknown {
  const id = contentRow.id;

  const phases = phaseRows
    .filter((r) => (r.phase_id ?? "").trim())
    .map((pr) => {
      const phaseId = pr.phase_id;
      const phaseKey = key(id, phaseId);
      const videos = (videosByPhase[phaseKey] ?? [])
        .filter((v) => (v.url ?? "").trim())
        .map((v) => ({
          title: v.title,
          url: v.url,
          author: v.author || undefined,
        }));
      const mitRow = (mitByPhase[phaseKey] ?? []).find((m) => (m.url ?? "").trim());
      const mitigation = mitRow
        ? {
            name: mitRow.name,
            url: mitRow.url,
            copyable: parseBool(mitRow.copyable),
          }
        : undefined;
      const strategies = (stratsByPhase[phaseKey] ?? [])
        .filter((s) => (s.id ?? "").trim())
        .map((s) => ({
          id: s.id,
          name: s.name,
          popular: parseBool(s.popular),
          description: s.description || undefined,
        }));
      const tips = (tipsByPhase[phaseKey] ?? [])
        .map((t) => t.tip)
        .filter((t) => t.trim().length > 0);

      const phaseObj: Record<string, unknown> = {
        id: phaseId,
        name: pr.name,
        order: parseInt10(pr.order, 0),
        videos,
        strategies,
        tips,
      };
      if (pr.popular_strategy && pr.popular_strategy.trim()) {
        phaseObj.popularStrategy = pr.popular_strategy;
      }
      if (pr.description && pr.description.trim()) phaseObj.description = pr.description;
      if (mitigation) phaseObj.mitigation = mitigation;
      return phaseObj;
    });

  const macros = macroRows
    .filter((m) => (m.source ?? "").trim() || (m.url ?? "").trim())
    .map((m) => ({
      ...(m.phase_id?.trim() ? { phaseId: m.phase_id.trim() } : {}),
      ...(m.strategy_id?.trim() ? { strategyId: m.strategy_id.trim() } : {}),
      source: m.source,
      url: m.url,
      text: m.text || undefined,
    }));

  const recruitmentTemplates = templateRows
    .filter((t) => (t.template ?? "").trim())
    .map((t) => {
      const vars = (t.variables ?? "").trim();
      return {
        template: t.template,
        variables: vars ? vars.split(/[,\s]+/).filter(Boolean) : [],
      };
    });

  const references: Record<string, unknown> = {
    urls: refRows
      .map((r) => r.url)
      .filter((u): u is string => !!u && u.trim().length > 0),
  };
  if (contentRow.references_primary?.trim()) {
    references.primary = contentRow.references_primary;
  }

  // Optional `overview` — assembled from the new columns on the contents tab
  const overview = buildOverview(contentRow);

  const out: Record<string, unknown> = {
    id,
    displayName: contentRow.displayName,
    shortName: contentRow.shortName,
    type: contentRow.type,
    phases,
    macros,
    recruitmentTemplates,
    references,
  };
  if (contentRow.patch?.trim()) out.patch = contentRow.patch;
  if (overview) out.overview = overview;
  return out;
}

/**
 * Build the `overview` block from contents-tab columns if any of the overview
 * fields are populated. Returns undefined if all are blank (= omit from YAML).
 */
function buildOverview(row: Record<string, string>): Record<string, unknown> | undefined {
  const main = row.overview_main_strategy?.trim() || "";
  const playlistTitle = row.overview_playlist_title?.trim() || "";
  const playlistUrl = row.overview_playlist_url?.trim() || "";
  const playlistAuthor = row.overview_playlist_author?.trim() || "";
  const macroSource = row.overview_macro_source?.trim() || "";
  const macroUrl = row.overview_macro_url?.trim() || "";
  const macroText = row.overview_macro_text?.trim() || "";
  const guideUrl = row.overview_guide_url?.trim() || "";
  const bisUrl = row.overview_bis_url?.trim() || "";

  const out: Record<string, unknown> = {};
  if (main) out.mainStrategy = main;
  if (playlistTitle && playlistUrl) {
    out.videoPlaylist = {
      title: playlistTitle,
      url: playlistUrl,
      ...(playlistAuthor ? { author: playlistAuthor } : {}),
    };
  }
  if (macroSource && macroUrl) {
    out.partyWideMacro = {
      source: macroSource,
      url: macroUrl,
      ...(macroText ? { text: macroText } : {}),
    };
  }
  if (guideUrl) out.guideUrl = guideUrl;
  if (bisUrl) out.bisUrl = bisUrl;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function groupBy<T extends Record<string, string>>(
  rows: T[],
  key: string | ((r: T) => string)
): Record<string, T[]> {
  const fn = typeof key === "string" ? (r: T) => r[key] ?? "" : key;
  const out: Record<string, T[]> = {};
  for (const row of rows) {
    const k = fn(row);
    if (!k) continue;
    (out[k] ??= []).push(row);
  }
  return out;
}

function key(contentId: string, phaseId: string): string {
  return `${contentId}::${phaseId}`;
}

function parseInt10(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseBool(s: string | undefined): boolean {
  if (!s) return false;
  const v = s.toLowerCase().trim();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function formatZodError(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ")
    .slice(0, 300);
}
