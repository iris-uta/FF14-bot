/**
 * Auto-populate macros[].phaseId from regex on the source string.
 * Uses the project's own yaml-writer to preserve formatting.
 */
import { resolve } from "node:path";
import { loadAllContents } from "../../schema/src/index";
import { writeContentYaml } from "../src/yaml-writer";

const CONTENTS_DIR = resolve(process.cwd(), "../../data/contents");
const PHASE_RE = /\bP(\d+)\b/i;

const contents = loadAllContents(CONTENTS_DIR);
let totalTagged = 0;
let filesChanged = 0;

for (const c of contents) {
  const validPhases = new Set(c.phases.map((p) => p.id));
  let changed = false;
  for (const m of c.macros) {
    if (m.phaseId) continue;
    const matches = [...m.source.matchAll(/\bP(\d+)\b/gi)].map((x) => x[1]);
    const unique = [...new Set(matches)];
    if (unique.length !== 1) continue;
    const phaseId = `p${unique[0]}`;
    if (!validPhases.has(phaseId)) continue;
    m.phaseId = phaseId;
    totalTagged++;
    changed = true;
  }
  if (changed) {
    const r = writeContentYaml(c, CONTENTS_DIR);
    console.log(`  ${r.status.padEnd(8)} ${r.path}`);
    filesChanged++;
  }
}

console.log(`\nTotal macros tagged: ${totalTagged}`);
console.log(`Files changed: ${filesChanged}`);
