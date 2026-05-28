import type { Content, Phase } from "@ff14kotei/schema";

type MacroRef = Content["macros"][number];

export function getMacrosForPhase(content: Content, phaseId: string): MacroRef[] {
  // Preferred: explicit phaseId field on the macro (post overview/guide/bis
  // schema refactor).
  const explicit = content.macros.filter((m) => m.phaseId === phaseId);
  if (explicit.length > 0) return explicit;

  // Fallback for legacy YAML that hasn't been migrated yet — regex-match the
  // phase number against the macro's source string (e.g. "りりーどーる (P3)").
  // Only macros WITHOUT a phaseId are considered here, so explicit assignments
  // always win.
  const phaseNumberMatch = phaseId.match(/(\d+)/);
  if (!phaseNumberMatch) return [];
  const phaseNumber = phaseNumberMatch[1];
  const pattern = new RegExp(`\\bP${phaseNumber}\\b`, "i");
  return content.macros.filter((m) => !m.phaseId && pattern.test(m.source));
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
