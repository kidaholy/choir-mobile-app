import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateAssignments, type Candidate, type ServiceRecord } from '../src/lib/assignment';

/** Deterministic PRNG so tie-breaking assertions are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLES = [
  { id: 'r-preach', name: 'Preaching', sort_order: 1 },
  { id: 'r-open', name: 'Opening prayer', sort_order: 2 },
  { id: 'r-close', name: 'Closing prayer', sort_order: 3 },
  { id: 'r-bible', name: 'Bible reading', sort_order: 4 },
];

const MEMBERS: Candidate[] = [
  { id: 'm1', full_name: 'Ada' },
  { id: 'm2', full_name: 'Ben' },
  { id: 'm3', full_name: 'Cara' },
  { id: 'm4', full_name: 'Dan' },
  { id: 'm5', full_name: 'Eve' },
  { id: 'm6', full_name: 'Fay' },
];

function historyOf(counts: Record<string, number>, day = '2026-01-01'): ServiceRecord[] {
  const out: ServiceRecord[] = [];
  for (const [memberId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) out.push({ member_id: memberId, assigned_on: day });
  }
  return out;
}

test('every role is filled with a distinct member', () => {
  const result = generateAssignments(
    { roles: ROLES, members: MEMBERS, history: [] },
    mulberry32(1),
  );

  assert.equal(result.assignments.length, ROLES.length);
  assert.equal(result.unassigned_role_ids.length, 0);

  const memberIds = result.assignments.map((a) => a.member_id);
  assert.equal(new Set(memberIds).size, memberIds.length, 'nobody holds two roles the same day');

  const roleIds = result.assignments.map((a) => a.role_id);
  assert.equal(new Set(roleIds).size, roleIds.length, 'each role filled exactly once');
});

test('roles are filled in sort_order', () => {
  const result = generateAssignments({ roles: ROLES, members: MEMBERS }, mulberry32(2));
  const filledInOrder = result.assignments.map((a) => a.role_id);
  assert.deepEqual(filledInOrder, ['r-preach', 'r-open', 'r-close', 'r-bible']);
});

test('inactive members are never chosen', () => {
  const members: Candidate[] = [
    { id: 'm1', full_name: 'Ada', is_active: false },
    { id: 'm2', full_name: 'Ben', is_active: true },
  ];
  const result = generateAssignments(
    { roles: [{ id: 'r1', name: 'Preaching' }], members },
    mulberry32(3),
  );
  assert.equal(result.assignments[0]?.member_id, 'm2');
});

test('prefers the member who has served the fewest times (fair rotation)', () => {
  // Only one role: fairness alone decides. m2 has served once, others many.
  const history = historyOf({ m1: 7, m2: 1, m3: 4, m4: 9, m5: 2, m6: 6 });
  const result = generateAssignments(
    { roles: [{ id: 'r1', name: 'Preaching' }], members: MEMBERS, history },
    mulberry32(4),
  );
  assert.equal(result.assignments[0]?.member_id, 'm2', 'least-served member must win');
});

test('when counts tie, the person who served longest ago wins (no repeat)', () => {
  const members: Candidate[] = [
    { id: 'm1', full_name: 'Ada' },
    { id: 'm2', full_name: 'Ben' },
    { id: 'm3', full_name: 'Cara' },
  ];
  // m1 and m2 both served twice, but m1 served only yesterday.
  const history: ServiceRecord[] = [
    { member_id: 'm1', assigned_on: '2026-02-10' },
    { member_id: 'm1', assigned_on: '2026-02-05' },
    { member_id: 'm2', assigned_on: '2026-01-05' },
    { member_id: 'm2', assigned_on: '2026-01-01' },
    { member_id: 'm3', assigned_on: '2026-02-11' },
  ];
  // m3 has served only ONCE, so fairness puts it in the winning tier first.
  const oneRole = generateAssignments(
    { roles: [{ id: 'r1', name: 'Preaching' }], members, history },
    mulberry32(5),
    Date.parse('2026-02-11T12:00:00Z'),
  );
  assert.equal(oneRole.assignments[0]?.member_id, 'm3', 'fewest services dominates');

  // Now make m3's count equal to m1/m2 so recency decides.
  const tied: ServiceRecord[] = [
    ...history,
    { member_id: 'm3', assigned_on: '2026-02-01' },
  ];
  const recencyDecides = generateAssignments(
    { roles: [{ id: 'r1', name: 'Preaching' }], members, history: tied },
    mulberry32(6),
    Date.parse('2026-02-11T12:00:00Z'),
  );
  // m1,m2,m3 all on 3 services; m2's last was 2026-01-01 (longest gap) -> m2.
  assert.equal(recencyDecides.assignments[0]?.member_id, 'm2', 'longest gap wins the tie');
});

test('roles that cannot be filled are reported, not silently dropped', () => {
  const members: Candidate[] = [
    { id: 'm1', full_name: 'Ada' },
    { id: 'm2', full_name: 'Ben' },
  ];
  const result = generateAssignments({ roles: ROLES, members }, mulberry32(7));
  assert.equal(result.assignments.length, 2, 'both people used');
  assert.equal(result.unassigned_role_ids.length, 2, 'two roles could not be filled');
  assert.deepEqual(result.unassigned_role_ids, ['r-close', 'r-bible']);
});

test('existing assignments are kept and their members are not reused', () => {
  const result = generateAssignments(
    {
      roles: ROLES,
      members: MEMBERS,
      existing: [{ role_id: 'r-open', member_id: 'm2' }],
    },
    mulberry32(8),
  );

  const preserved = result.assignments.find((a) => a.role_id === 'r-open');
  assert.equal(preserved?.member_id, 'm2', 'admin-placed member was not moved');

  const memberIds = result.assignments.map((a) => a.member_id);
  assert.equal(new Set(memberIds).size, memberIds.length, 'existing member not double-assigned');

  const roleIds = result.assignments.map((a) => a.role_id);
  assert.equal(new Set(roleIds).size, roleIds.length, 'existing role not filled twice');
  assert.equal(result.assignments.length, ROLES.length);
});

test('an unparseable date is treated as "never served", not a crash', () => {
  const history = historyOf({ m1: 5, m5: 5 });
  history.push({ member_id: 'm2', assigned_on: 'not-a-date' });
  const result = generateAssignments(
    { roles: [{ id: 'r1', name: 'Preaching' }], members: MEMBERS, history },
    mulberry32(9),
    Date.parse('2026-02-11T12:00:00Z'),
  );
  // m2 has 1 (bad-date) service; m3/m4/m6 have 0 -> they are the fair tier.
  assert.ok(['m3', 'm4', 'm6'].includes(result.assignments[0]?.member_id ?? ''));
});

test('a fixed rng makes regeneration reproducible', () => {
  const input = { roles: ROLES, members: MEMBERS, history: historyOf({ m1: 1, m2: 1 }) };
  const a = generateAssignments(input, mulberry32(42));
  const b = generateAssignments(input, mulberry32(42));
  assert.deepEqual(a, b);
});

test('simulated season stays evenly spread across members', () => {
  // 30 programs, 6 members, 4 duties each = 120 duties. Perfect fairness is
  // 20 each. A purely random assignment would land ±15 spread; fair rotation
  // must stay within a few duties of perfectly even.
  const counts: Record<string, number> = {};
  for (const m of MEMBERS) counts[m.id] = 0;
  const history: ServiceRecord[] = [];
  let day = 0;

  for (let round = 0; round < 30; round++) {
    day += 7;
    const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
    const result = generateAssignments(
      { roles: ROLES, members: MEMBERS, history },
      mulberry32(1000 + round),
      Date.parse(`${date}T12:00:00Z`),
    );

    const ids = result.assignments.map((a) => a.member_id);
    assert.equal(new Set(ids).size, ids.length, `round ${round} had a duplicate member`);

    for (const a of result.assignments) {
      counts[a.member_id] += 1;
      history.push({ member_id: a.member_id, assigned_on: date });
    }
  }

  const values = MEMBERS.map((m) => counts[m.id]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  assert.equal(
    values.reduce((s, v) => s + v, 0),
    120,
    'every duty was assigned',
  );
  assert.ok(
    max - min <= 3,
    `service spread too wide: ${JSON.stringify(counts)} (max ${max}, min ${min})`,
  );
});
