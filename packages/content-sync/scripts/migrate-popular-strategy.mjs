import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENTS_DIR = resolve(HERE, "../../../data/contents");
const PATTERN = /野良主流(?:は|では)?「([^」]+)」/;

const files = readdirSync(CONTENTS_DIR).filter(
  (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_")
);

let totalUpdated = 0;
let totalPhases = 0;

for (const f of files) {
  const path = join(CONTENTS_DIR, f);
  const text = readFileSync(path, "utf-8");
  const data = parse(text);
  if (!data?.phases) continue;
  let changed = false;
  for (const phase of data.phases) {
    totalPhases++;
    if (phase.popularStrategy) continue;  // already populated
    if (!phase.description) continue;
    const match = phase.description.match(PATTERN);
    if (match) {
      phase.popularStrategy = match[1];
      changed = true;
      totalUpdated++;
      console.log(`  ${f} / ${phase.id} → popularStrategy: ${match[1]}`);
    }
  }
  if (changed) {
    // Preserve key order via custom write
    const reordered = {};
    for (const k of ["id", "displayName", "shortName", "type", "patch"]) {
      if (k in data) reordered[k] = data[k];
    }
    reordered.phases = data.phases.map((p) => {
      const out = {};
      for (const k of ["id", "name", "order", "popularStrategy", "description", "videos", "mitigation", "strategies", "tips"]) {
        if (p[k] !== undefined) out[k] = p[k];
      }
      return out;
    });
    for (const k of ["macros", "recruitmentTemplates", "references"]) {
      if (data[k] !== undefined) reordered[k] = data[k];
    }
    const yaml = stringify(reordered, { indent: 2, lineWidth: 100, minContentWidth: 20 });
    writeFileSync(path, yaml, "utf-8");
  }
}

console.log("");
console.log(`Updated ${totalUpdated} phase(s) out of ${totalPhases} total`);
