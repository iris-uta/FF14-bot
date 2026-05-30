import type { Content, Phase } from "@ff14kotei/schema";

type MacroRef = Content["macros"][number];

/**
 * Resolve which macros belong to a phase.
 *
 * Per-macro resolution:
 *  - If the macro has a structured `phases` array, it matches when that array
 *    contains `phaseId` (the source of truth — works for savage 前半/後半/Ver.X
 *    naming and 全 phase 共通 macros that the regex can't express).
 *  - Otherwise fall back to sniffing a `P<n>` token out of `source` for
 *    backward compat with macros that haven't been backfilled yet.
 */
export function getMacrosForPhase(content: Content, phaseId: string): MacroRef[] {
  const phaseNumber = phaseId.match(/(\d+)/)?.[1];
  const pattern = phaseNumber ? new RegExp(`\\bP${phaseNumber}\\b`, "i") : null;
  return content.macros.filter((m) =>
    m.phases ? m.phases.includes(phaseId) : pattern ? pattern.test(m.source) : false
  );
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
