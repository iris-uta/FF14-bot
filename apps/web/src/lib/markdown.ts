import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Read a markdown file from the repo root (relative path) and render to HTML.
 * Used by privacy/terms pages to serve docs/legal/*.md content.
 *
 * Output is sanitized: even though source files are repo-controlled, defense-in-depth
 * blocks accidental copy-paste of <script> / <iframe> / event handlers from external
 * sources into a markdown file.
 */
export function renderMarkdownFile(relativePathFromRepoRoot: string): string {
  const path = resolve(process.cwd(), "../..", relativePathFromRepoRoot);
  const raw = readFileSync(path, "utf-8");
  const html = marked.parse(raw, { async: false }) as string;
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Allow common markdown output but block scripts / iframes / inline event handlers.
 * Whitelist approach (additive) — anything not listed is stripped.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // headings
    "h1", "h2", "h3", "h4", "h5", "h6",
    // text + structure
    "p", "br", "hr", "blockquote",
    "strong", "em", "del", "s", "u", "small", "sup", "sub",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    // inline
    "a", "code", "pre", "kbd", "abbr",
    // images intentionally omitted — none used in legal docs and avoids tracker pixels
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    code: ["class"],   // for syntax highlighting language hints (e.g. language-yaml)
    pre: ["class"],
    th: ["align"],
    td: ["align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // <a target=_blank> automatically gets rel=noopener noreferrer added.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};
