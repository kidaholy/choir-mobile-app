/**
 * Random member assignment — pure, dependency-free, fully unit-testable.
 *
 * The rules this implements, in priority order:
 *
 *  1. Different people hold different roles on the same day
 *     (`usedMemberIds` — also enforced by unique (program_id, member_id)).
 *  2. Fair rotation: prefer members who have served the fewest times overall.
 *  3. No unnecessary repeats: within that fairness tier, prefer the member
 *     who served least recently.
 *  4. Genuine randomness only where it cannot break rules 1–3: a random pick
 *     among members that tie on both fairness and recency.
 *
 * Everything here is deterministic given the `rng`, so tests can pin results.
 */

export type RoleSlot = {
  id: string;
  name: string;
  sort_order?: number;
};

export type Candidate = {
  id: string;
  full_name: string;
  is_active?: boolean;
};

/** A past duty: used to count how often and how recently someone served. */
export type ServiceRecord = {
  member_id: string;
  /** ISO date (YYYY-MM-DD). Anything unparseable counts as "never". */
  assigned_on: string;
};

export type ExistingAssignment = {
  role_id: string;
  member_id: string;
};

export type AssignmentInput = {
  /** Roles to fill, in the order they should be filled. */
  roles: RoleSlot[];
  /** People who may be picked. Inactive members are skipped. */
  members: Candidate[];
  /** Historical service, used for fairness + recency. */
  history?: ServiceRecord[];
  /** Already-assigned duties on this program (admin edits / regenerate). */
  existing?: ExistingAssignment[];
};

export type Assignment = {
  role_id: string;
  member_id: string;
};

export type AssignmentResult = {
  assignments: Assignment[];
  /** Active roles that could not be filled (not enough eligible people). */
  unassigned_role_ids: string[];
};

type Scored = {
  member: Candidate;
  timesServed: number;
  daysSinceLast: number; // Number.MAX_SAFE_INTEGER when never served
};

/** Tolerant ISO-date parse: unparseable dates are treated as "never served". */
function daysSince(isoDate: string | undefined, nowMs: number): number {
  if (!isoDate) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return Number.MAX_SAFE_INTEGER;
  const days = Math.floor((nowMs - parsed) / 86_400_000);
  return Number.isFinite(days) ? days : Number.MAX_SAFE_INTEGER;
}

function sortRoles(roles: RoleSlot[]): RoleSlot[] {
  return [...roles].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Pick fairly among `candidates`.
 *
 * Returns null only when there is nobody left to choose from.
 */
function pickBest(
  candidates: Candidate[],
  history: ServiceRecord[],
  usedMemberIds: Set<string>,
  nowMs: number,
  rng: () => number,
): Candidate | null {
  const eligible = candidates.filter((m) => m.is_active !== false && !usedMemberIds.has(m.id));
  if (eligible.length === 0) return null;

  const scored: Scored[] = eligible.map((member) => {
    let timesServed = 0;
    let mostRecent = '';
    for (const record of history) {
      if (record.member_id !== member.id) continue;
      timesServed += 1;
      if (record.assigned_on > mostRecent) mostRecent = record.assigned_on;
    }
    return { member, timesServed, daysSinceLast: daysSince(mostRecent, nowMs) };
  });

  // Priority 2: fewest total services wins.
  const minTimes = Math.min(...scored.map((s) => s.timesServed));
  const fairTier = scored.filter((s) => s.timesServed === minTimes);

  // Priority 3: among the fairest, prefer the person who served longest ago.
  const maxGap = Math.max(...fairTier.map((s) => s.daysSinceLast));
  const bestTier = fairTier.filter((s) => s.daysSinceLast === maxGap);

  // Priority 4: break an exact tie with real randomness.
  const chosen = bestTier[Math.floor(rng() * bestTier.length)];
  return chosen.member;
}

/**
 * Fill every given role with a distinct member, honouring existing
 * assignments first (they are never moved).
 */
export function generateAssignments(
  input: AssignmentInput,
  rng: () => number = Math.random,
  nowMs: number = Date.now(),
): AssignmentResult {
  const history = input.history ?? [];
  const existing = input.existing ?? [];

  const assignments: Assignment[] = [];
  const usedMemberIds = new Set<string>();
  for (const e of existing) {
    usedMemberIds.add(e.member_id);
    assignments.push({ role_id: e.role_id, member_id: e.member_id });
  }

  const filledRoleIds = new Set(existing.map((e) => e.role_id));
  const unassigned: string[] = [];

  for (const role of sortRoles(input.roles)) {
    if (filledRoleIds.has(role.id)) continue; // admin already placed someone
    const picked = pickBest(input.members, history, usedMemberIds, nowMs, rng);
    if (!picked) {
      unassigned.push(role.id);
      continue;
    }
    usedMemberIds.add(picked.id);
    assignments.push({ role_id: role.id, member_id: picked.id });
    filledRoleIds.add(role.id);
  }

  return { assignments, unassigned_role_ids: unassigned };
}
