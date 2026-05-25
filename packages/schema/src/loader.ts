import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ContentSchema, type Content } from "./content";

export class ContentValidationError extends Error {
  constructor(public file: string, public original: unknown) {
    super(`Content validation failed: ${file}`);
    this.name = "ContentValidationError";
  }
}

export function loadContentFromFile(filePath: string): Content {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const result = ContentSchema.safeParse(parsed);
  if (!result.success) {
    throw new ContentValidationError(filePath, result.error.format());
  }
  return result.data;
}

export function loadAllContents(contentsDir: string): Content[] {
  const files = readdirSync(contentsDir).filter(
    (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_")
  );
  return files.map((f) => loadContentFromFile(join(contentsDir, f)));
}
