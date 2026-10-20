/**
 * Core data types for the local-first sync model.
 *
 * Everything is stored on-device. The unit of synchronization is an "op"
 * (operation): an idempotent, broadcastable patch. Ops are appended to a
 * local log (the op log) and shared with other phones through a dumb
 * WebSocket relay that never stores anything.
 *
 * Merge rule: last-write-wins per *field*, where a write is ordered by
 * (timestampMs, deviceId). That way two people editing different fields
 * of the same item (one edits the text, another checks it off) never
 * clobber each other, and every device converges to the same state.
 */

/** LWW stamp: [updatedAtMs, originDeviceId]. */
export type Stamp = [number, string];

export type PatchValue<T> = { v: T; u: Stamp };

export type ListOpPatch = {
  name?: PatchValue<string>;
  deleted?: PatchValue<boolean>;
  /** Creation time hint, only used when the row does not exist yet. */
  createdAt?: number;
};

export type ItemOpPatch = {
  text?: PatchValue<string>;
  done?: PatchValue<boolean>;
  deleted?: PatchValue<boolean>;
  createdAt?: number;
};

export type BaseOp = {
  /** Unique op id — used for deduplication (ops are replay-safe). */
  id: string;
  /** Device that produced the op. */
  origin: string;
  /** Room the op belongs to (the share code of the list). */
  listId: string;
  /** Wall-clock time the op was produced (debug/display only, merge uses stamps). */
  ts: number;
};

export type ListOp = BaseOp & { kind: 'list.set'; patch: ListOpPatch };
export type ItemOp = BaseOp & { kind: 'item.set'; itemId: string; patch: ItemOpPatch };
export type Op = ListOp | ItemOp;

/** Materialized list row (includes merge stamps). */
export type ListRow = {
  id: string;
  name: string;
  nameU: Stamp;
  deleted: boolean;
  deletedU: Stamp;
  createdAt: number;
};

/** Materialized item row (includes merge stamps). */
export type ItemRow = {
  listId: string;
  id: string;
  text: string;
  textU: Stamp;
  done: boolean;
  doneU: Stamp;
  deleted: boolean;
  deletedU: Stamp;
  createdAt: number;
};

/** UI-facing shapes (stamps and tombstones stripped away). */
export type ListInfo = {
  id: string;
  name: string;
  createdAt: number;
};

export type ItemInfo = {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  createdAt: number;
};
