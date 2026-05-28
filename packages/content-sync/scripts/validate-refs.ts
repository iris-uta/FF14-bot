/**
 * Cross-reference validator — flag data inconsistencies that schema validation
 * alone can't catch (it validates per-record, not cross-references).
 *
 * Checks:
 *   1. macros[].strategyId → must exist in some phase.strategies[].id
 *   2. macros[].phaseId    → must exist in content.phases[].id
 *
 * Usage:
 *   pnpm --filter @ff14kotei/content-sync exec tsx scripts/validate-refs.ts
 */
import { resolve } from "node:path";
import { loadAllContents } from "../../schema/src/index";

const contents = loadAllContents(resolve(process.cwd(), "../../data/contents"));
let issues = 0;

for (const c of contents) {
  const validPhaseIds = new Set(c.phases.map((p) => p.id));
  const strategyByPhase = new Map<string, Set<string>>();
  for (const p of c.phases) {
    strategyByPhase.set(p.id, new Set(p.strategies.map((s) => s.id)));
  }

  for (const m of c.macros) {
    // phaseId must reference an existing phase
    if (m.phaseId && !validPhaseIds.has(m.phaseId)) {
      console.log(
        `  ❌ ${c.id}: macro phaseId="${m.phaseId}" but no such phase ` +
          `(source: ${m.source.slice(0, 60)}...)`
      );
      issues++;
    }
    // strategyId must reference a strategy that exists in the macro's phase
    // (or any phase if phaseId not set)
    if (m.strategyId) {
      const lookupPhases = m.phaseId ? [m.phaseId] : [...validPhaseIds];
      const found = lookupPhases.some((pid) =>
        strategyByPhase.get(pid)?.has(m.strategyId!)
      );
      if (!found) {
        console.log(
          `  ❌ ${c.id}${m.phaseId ? `/${m.phaseId}` : ""}: ` +
            `macro strategyId="${m.strategyId}" not defined in any strategy ` +
            `(source: ${m.source.slice(0, 60)}...)`
        );
        issues++;
      }
    }
  }
}

if (issues === 0) {
  console.log("✅ All macro phaseId / strategyId references resolve to existing definitions.");
} else {
  console.log(`\n⚠️  ${issues} unresolved reference(s). Add the missing rows to the strategies/phases tab.`);
  process.exit(1);
}
