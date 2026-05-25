import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";

/**
 * Read a markdown file from the repo root (relative path) and render to HTML.
 * Used by privacy/terms pages to serve docs/legal/*.md content.
 */
export function renderMarkdownFile(relativePathFromRepoRoot: string): string {
  const path = resolve(process.cwd(), "../..", relativePathFromRepoRoot);
  const raw = readFileSync(path, "utf-8");
  return marked.parse(raw, { async: false }) as string;
}
