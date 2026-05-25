import type { Content, Phase } from "@ff14kotei/schema";

export interface ChannelSpec {
  name: string;
  topic: string;
  phaseId: string;
}

export interface ChannelPlan {
  categoryName: string;
  channels: ChannelSpec[];
}

export interface BuildPlanOptions {
  partyName?: string;
}

export function buildChannelPlan(content: Content, options: BuildPlanOptions = {}): ChannelPlan {
  const baseName = options.partyName ?? content.displayName;
  const categoryName = `${baseName} 固定`.slice(0, 100);

  const channels = content.phases.map<ChannelSpec>((phase) => ({
    name: buildChannelName(phase),
    topic: buildPhaseTopic(phase),
    phaseId: phase.id,
  }));

  return { categoryName, channels };
}

function buildChannelName(phase: Phase): string {
  const bossLabel = stripBossNamePrefix(phase.name);
  const raw = bossLabel ? `${phase.id}-${bossLabel}` : phase.id;
  return sanitizeChannelName(raw);
}

function stripBossNamePrefix(phaseName: string): string {
  return phaseName
    .replace(/^P\d+\s*[-/／]?\s*/i, "")
    .replace(/\s*[（(][^)）]+[)）]\s*$/, "")
    .trim();
}

function sanitizeChannelName(raw: string): string {
  const collapsed = raw.trim().toLowerCase().replace(/\s+/g, "-");
  const stripped = collapsed.replace(/[^\p{L}\p{N}_-]/gu, "");
  const trimmed = stripped.replace(/^-+|-+$/g, "");
  return trimmed.slice(0, 100) || "untitled";
}

function buildPhaseTopic(phase: Phase): string {
  const parts: string[] = [];
  if (phase.description) {
    const firstLine = phase.description.split("\n").map((s) => s.trim()).find(Boolean);
    if (firstLine) parts.push(firstLine);
  }
  if (phase.strategies.length > 0) {
    parts.push(`処理方: ${phase.strategies.map((s) => s.name).join(" / ")}`);
  }
  if (phase.videos.length > 0) {
    parts.push(`動画 ${phase.videos.length}本`);
  }
  return parts.join(" — ").slice(0, 1024);
}
