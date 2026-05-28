import type { Content, Phase } from "@ff14kotei/schema";

type MacroRef = Content["macros"][number];

/**
 * Resolve macros for a phase, optionally narrowed to selected strategies.
 *
 * Filtering rules (when `selectedStrategyIds` is given):
 *  - macro.strategyId ∈ selectedStrategyIds → ✅ include (strategy-specific)
 *  - macro.strategyId === undefined         → ✅ include (phase-wide common)
 *  - macro.strategyId not selected           → ❌ exclude
 *
 * Without `selectedStrategyIds`, returns ALL macros for the phase (no strategy filter).
 *
 * Lookup priority:
 *  1. macros with explicit phaseId === phaseId (modern schema)
 *  2. fallback to legacy regex match on source for macros with no phaseId
 */
export function getMacrosForPhase(
  content: Content,
  phaseId: string,
  selectedStrategyIds?: string[]
): MacroRef[] {
  const matchesStrategy = (m: MacroRef): boolean => {
    if (!selectedStrategyIds || selectedStrategyIds.length === 0) return true;
    if (!m.strategyId) return true; // phase-common macro, always shown
    return selectedStrategyIds.includes(m.strategyId);
  };

  // Preferred: explicit phaseId field on the macro.
  const explicit = content.macros.filter((m) => m.phaseId === phaseId);
  if (explicit.length > 0) return explicit.filter(matchesStrategy);

  // Fallback: legacy regex match on source for macros without phaseId.
  const phaseNumberMatch = phaseId.match(/(\d+)/);
  if (!phaseNumberMatch) return [];
  const phaseNumber = phaseNumberMatch[1];
  const pattern = new RegExp(`\\bP${phaseNumber}\\b`, "i");
  return content.macros
    .filter((m) => !m.phaseId && pattern.test(m.source))
    .filter(matchesStrategy);
}

export interface PhaseLookup {
  content: Content;
  phase: Phase;
}

export function findPhase(content: Content, phaseId: string): PhaseLookup | null {
  const phase = content.phases.find((p) => p.id === phaseId);
  return phase ? { content, phase } : null;
}

/**
 * Discord code block (\`\`\`)max length is 2000 chars per message. Split long macro text
 * into chunks that fit, preserving line boundaries.
 */
export function splitMacroForDiscord(text: string, maxChars = 1900): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxChars) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
