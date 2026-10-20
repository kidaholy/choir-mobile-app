import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyItemOp, applyListOp, wins } from '../src/sync/merge';
import type { ItemOp, ItemRow, ListOp, ListRow } from '../src/sync/types';

const now = 1_700_000_000_000;

function makeList(name: string, origin = 'devA', at = now): ListRow {
  return {
    id: 'LIST1',
    name,
    nameU: [at, origin],
    deleted: false,
    deletedU: [at, origin],
    createdAt: at,
  };
}

function makeItem(text: string, origin = 'devA', at = now): ItemRow {
  return {
    listId: 'LIST1',
    id: 'ITEM1',
    text,
    textU: [at, origin],
    done: false,
    doneU: [at, origin],
    deleted: false,
    deletedU: [at, origin],
    createdAt: at,
  };
}

function itemPatchOp(patch: ItemOp['patch'], origin = 'devB', at = now + 1000): ItemOp {
  return { id: `op-${Math.random()}`, kind: 'item.set', origin, listId: 'LIST1', itemId: 'ITEM1', ts: at, patch };
}

test('newer write wins on the same field', () => {
  assert.equal(wins([now, 'devA'], [now + 1, 'devB']), true);
  assert.equal(wins([now, 'devA'], [now - 1, 'devB']), false);
});

test('tie on the same millisecond breaks by device id (convergent)', () => {
  assert.equal(wins([now, 'devA'], [now, 'devB']), true);
  assert.equal(wins([now, 'devB'], [now, 'devA']), false);
  // whichever order ops arrive, the same device wins the tie
  const op1 = itemPatchOp({ text: { v: 'from A', u: [now, 'devA'] } }, 'devA', now);
  const op2 = itemPatchOp({ text: { v: 'from B', u: [now, 'devB'] } }, 'devB', now);
  const ab = applyItemOp(applyItemOp(makeItem('start'), op1), op2);
  const ba = applyItemOp(applyItemOp(makeItem('start'), op2), op1);
  assert.deepEqual(ab, ba);
});

test('stale write does not overwrite a newer value', () => {
  const stale = itemPatchOp({ text: { v: 'old', u: [now - 5000, 'devB'] } }, 'devB', now - 5000);
  const merged = applyItemOp(makeItem('fresh', 'devA', now), stale);
  assert.equal(merged.text, 'fresh');
});

test('concurrent edits to DIFFERENT fields do not clobber each other', () => {
  // phone A renames the text while phone B checks the box at the same time
  const a = itemPatchOp({ text: { v: 'renamed by A', u: [now + 10, 'devA'] } }, 'devA', now + 10);
  const b = itemPatchOp({ done: { v: true, u: [now + 10, 'devB'] } }, 'devB', now + 10);
  const ab = applyItemOp(applyItemOp(makeItem('orig'), a), b);
  const ba = applyItemOp(applyItemOp(makeItem('orig'), b), a);
  assert.equal(ab.text, 'renamed by A');
  assert.equal(ab.done, true);
  assert.deepEqual(ab, ba); // both arrival orders converge
});

test('later edit to the same field wins', () => {
  const first = itemPatchOp({ text: { v: 'first', u: [now + 10, 'devA'] } }, 'devA', now + 10);
  const second = itemPatchOp({ text: { v: 'second', u: [now + 20, 'devB'] } }, 'devB', now + 20);
  const merged = applyItemOp(applyItemOp(makeItem('zero'), first), second);
  assert.equal(merged.text, 'second');
});

test('deleting an item is a tombstone that survives re-sync', () => {
  const del = itemPatchOp({ deleted: { v: true, u: [now + 30, 'devB'] } }, 'devB', now + 30);
  const merged = applyItemOp(makeItem('bye'), del);
  assert.equal(merged.deleted, true);
  // an older "not deleted" op arriving later must not resurrect it
  const oldUndelete = itemPatchOp({ deleted: { v: false, u: [now, 'devA'] } }, 'devA', now);
  const after = applyItemOp(merged, oldUndelete);
  assert.equal(after.deleted, true);
});

test('list ops create the row when it does not exist yet', () => {
  const op: ListOp = {
    id: 'op-list',
    kind: 'list.set',
    origin: 'devA',
    listId: 'LIST1',
    ts: now,
    patch: {
      name: { v: 'Groceries', u: [now, 'devA'] },
      deleted: { v: false, u: [now, 'devA'] },
      createdAt: now,
    },
  };
  const row = applyListOp(null, op);
  assert.equal(row.name, 'Groceries');
  assert.equal(row.deleted, false);
  assert.equal(row.createdAt, now);

  // a stale rename cannot clobber it
  const stale: ListOp = { ...op, id: 'op-list-2', patch: { name: { v: 'stale', u: [now - 100, 'devB'] } } };
  assert.equal(applyListOp(row, stale).name, 'Groceries');
});

test('list rename by another phone later in time wins', () => {
  const row = makeList('Old');
  const rename: ListOp = {
    id: 'op-rename',
    kind: 'list.set',
    origin: 'devB',
    listId: 'LIST1',
    ts: now + 5,
    patch: { name: { v: 'New', u: [now + 5, 'devB'] } },
  };
  assert.equal(applyListOp(row, rename).name, 'New');
});
