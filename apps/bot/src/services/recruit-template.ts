import type { Content } from "@ff14kotei/schema";

type RecruitmentTemplate = Content["recruitmentTemplates"][number];

export interface RenderedTemplate {
  text: string;
  unfilledVariables: string[];
}

/**
 * Substitute {{name}} placeholders in template body with provided values.
 * Returns the rendered text and a list of variables that were declared but not provided.
 */
export function renderTemplate(
  template: RecruitmentTemplate,
  values: Record<string, string | undefined>
): RenderedTemplate {
  const unfilled: string[] = [];
  const text = template.template.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined || value === "") {
      if (!unfilled.includes(name)) unfilled.push(name);
      return match;
    }
    return value;
  });
  return { text, unfilledVariables: unfilled };
}

export function findTemplate(content: Content, index: number = 0): RecruitmentTemplate | null {
  return content.recruitmentTemplates[index] ?? null;
}

/**
 * Extract all {{var}} placeholder names actually used in the template body.
 * Useful when the declared `variables` array is empty or incomplete.
 */
export function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const re = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      found.push(match[1]);
    }
  }
  return found;
}
