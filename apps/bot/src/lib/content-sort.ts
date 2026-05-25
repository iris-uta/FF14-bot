import type { Content } from "@ff14kotei/schema";

/**
 * Parse a patch string like "7.51" or "4.11" into a numeric tuple for comparison.
 * Treats missing patch as Infinity (sort to end).
 */
function patchTuple(p: string | null | undefined): number[] {
  if (!p) return [Number.POSITIVE_INFINITY];
  return p.split(".").map((s) => Number.parseInt(s, 10) || 0);
}

function comparePatches(a: string | null | undefined, b: string | null | undefined): number {
  const pa = patchTuple(a);
  const pb = patchTuple(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Sort contents by implementation order: patch number ascending, with
 * unknown-patch contents going to the end. Ties broken by id alphabetically.
 */
export function sortByPatch(contents: readonly Content[]): Content[] {
  return [...contents].sort((a, b) => {
    const cmp = comparePatches(a.patch, b.patch);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });
}
