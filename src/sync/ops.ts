import type { ItemOp, ItemOpPatch, ListOp, ListOpPatch, Stamp } from './types';

/** Unique-enough op id; no crypto needed (only uniqueness matters for dedupe). */
export function newOpId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

export function stamp(origin: string, at: number = Date.now()): Stamp {
  return [at, origin];
}

export function listSetOp(
  listId: string,
  origin: string,
  patch: ListOpPatch,
  at: number = Date.now(),
): ListOp {
  return { id: newOpId(), kind: 'list.set', origin, listId, ts: at, patch };
}

export function itemSetOp(
  listId: string,
  origin: string,
  itemId: string,
  patch: ItemOpPatch,
  at: number = Date.now(),
): ItemOp {
  return { id: newOpId(), kind: 'item.set', origin, listId, itemId, ts: at, patch };
}
