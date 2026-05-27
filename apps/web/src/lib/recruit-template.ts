/**
 * Pure-function recruit template renderer.
 * Mirror of apps/bot/src/services/recruit-template.ts so the web tool can
 * generate the same output without depending on the bot.
 */

export interface RenderedTemplate {
  text: string;
  unfilledVariables: string[];
}

/**
 * Substitute `{{name}}` placeholders. Returns text + variables that were
 * declared but not provided (so the form can highlight missing inputs).
 */
export function renderTemplate(
  templateBody: string,
  values: Record<string, string | undefined>
): RenderedTemplate {
  const unfilled: string[] = [];
  const text = templateBody.replace(
    /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g,
    (match, name: string) => {
      const v = values[name];
      if (v === undefined || v === "") {
        if (!unfilled.includes(name)) unfilled.push(name);
        return match;
      }
      return v;
    }
  );
  return { text, unfilledVariables: unfilled };
}

/**
 * Extract all unique `{{var}}` names in declaration order.
 */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}
