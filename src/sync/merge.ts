import type { ItemOp, ItemRow, ListOp, ListRow, Stamp } from './types';

/** Returns true when `incoming` should overwrite `current` (LWW on (ts, origin)). */
export function wins(current: Stamp | undefined, incoming: Stamp): boolean {
  if (!current) return true;
  if (incoming[0] !== current[0]) return incoming[0] > current[0];
  return incoming[1] > current[1];
}

/** Applies a list op onto a list row (creates the row when missing). Pure. */
export function applyListOp(row: ListRow | null, op: ListOp): ListRow {
  const base: ListRow =
    row ?? {
      id: op.listId,
      name: '',
      nameU: [0, ''],
      deleted: false,
      deletedU: [0, ''],
      createdAt: op.patch.createdAt ?? op.ts,
    };

  const patch = op.patch;
  let next = base;
  if (patch.name && wins(next.nameU, patch.name.u)) {
    next = { ...next, name: patch.name.v, nameU: patch.name.u };
  }
  if (patch.deleted && wins(next.deletedU, patch.deleted.u)) {
    next = { ...next, deleted: patch.deleted.v, deletedU: patch.deleted.u };
  }
  if (patch.createdAt !== undefined && !row) {
    next = { ...next, createdAt: patch.createdAt };
  }
  return next;
}

/** Applies an item op onto an item row (creates the row when missing). Pure. */
export function applyItemOp(row: ItemRow | null, op: ItemOp): ItemRow {
  const base: ItemRow =
    row ?? {
      listId: op.listId,
      id: op.itemId,
      text: '',
      textU: [0, ''],
      done: false,
      doneU: [0, ''],
      deleted: false,
      deletedU: [0, ''],
      createdAt: op.patch.createdAt ?? op.ts,
    };

  const patch = op.patch;
  let next = base;
  if (patch.text && wins(next.textU, patch.text.u)) {
    next = { ...next, text: patch.text.v, textU: patch.text.u };
  }
  if (patch.done && wins(next.doneU, patch.done.u)) {
    next = { ...next, done: patch.done.v, doneU: patch.done.u };
  }
  if (patch.deleted && wins(next.deletedU, patch.deleted.u)) {
    next = { ...next, deleted: patch.deleted.v, deletedU: patch.deleted.u };
  }
  if (patch.createdAt !== undefined && !row) {
    next = { ...next, createdAt: patch.createdAt };
  }
  return next;
}
