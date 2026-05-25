import { resolve } from "node:path";
import { loadAllContents, ContentValidationError } from "../loader";

const contentsDir = resolve(process.cwd(), "../../data/contents");

try {
  const contents = loadAllContents(contentsDir);
  console.log(`✓ ${contents.length} content file(s) validated`);
  for (const c of contents) {
    console.log(`  - ${c.id} (${c.displayName}) — ${c.phases.length} phase(s)`);
  }
} catch (err) {
  if (err instanceof ContentValidationError) {
    console.error(`✗ ${err.file}`);
    console.error(JSON.stringify(err.original, null, 2));
    process.exit(1);
  }
  throw err;
}
