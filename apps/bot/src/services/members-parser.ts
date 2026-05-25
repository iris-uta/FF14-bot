/**
 * Parse a free-form member specification string into structured entries.
 *
 * Format: "<@USERID> ROLE JOB, <@USERID> ROLE JOB, ..."
 * Roles: MT, ST, H1, H2, D1, D2, D3, D4 (case-insensitive)
 * Jobs: any FF14 job 2-4 letter abbreviation (PLD, WAR, GNB, DRK, WHM, SCH, AST, SGE,
 *       MNK, DRG, NIN, SAM, RPR, VPR, PCT, BRD, MCH, DNC, BLM, SMN, RDM, BLU, PIC)
 *
 * Example input:
 *   "<@111> MT PLD, <@222> ST GNB, <@333> H1 SCH"
 *
 * Returns parsed entries or throws ParseError with first issue.
 */

export type GameRole = "MT" | "ST" | "H1" | "H2" | "D1" | "D2" | "D3" | "D4";

export const VALID_ROLES: readonly GameRole[] = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];

export interface MemberSpec {
  userId: string;
  role: GameRole;
  job: string;
}

export class MemberSpecParseError extends Error {
  constructor(public readonly fragment: string, message: string) {
    super(`${message} (at: "${fragment}")`);
    this.name = "MemberSpecParseError";
  }
}

export function parseMembers(input: string): MemberSpec[] {
  const trimmed = input.trim();
  if (trimmed === "") return [];

  const entries = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  return entries.map(parseEntry);
}

function parseEntry(entry: string): MemberSpec {
  // <@USERID> or <@!USERID>  followed by ROLE  followed by JOB
  const match = entry.match(/^<@!?(\d{15,21})>\s+([A-Za-z][A-Za-z0-9]*)\s+([A-Za-z]{2,4})$/);
  if (!match) {
    throw new MemberSpecParseError(
      entry,
      "形式エラー: '<@userId> ROLE JOB' で記述してください"
    );
  }

  const [, userId, roleRaw, jobRaw] = match;
  const role = roleRaw.toUpperCase() as GameRole;
  if (!VALID_ROLES.includes(role)) {
    throw new MemberSpecParseError(
      entry,
      `不正なロール: ${roleRaw}。有効: ${VALID_ROLES.join(", ")}`
    );
  }
  return { userId, role, job: jobRaw.toUpperCase() };
}

/**
 * Verify each role appears at most once.
 */
export function checkRoleUniqueness(members: MemberSpec[]): { ok: boolean; duplicateRoles: GameRole[] } {
  const seen = new Map<GameRole, number>();
  for (const m of members) {
    seen.set(m.role, (seen.get(m.role) ?? 0) + 1);
  }
  const duplicateRoles = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([role]) => role);
  return { ok: duplicateRoles.length === 0, duplicateRoles };
}
