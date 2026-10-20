import type { ItemRow, ListRow, Op } from '../sync/types';
import { MemoryStorage } from './memory';

const STORAGE_KEY = 'shared-lists/db/v1';

type Snapshot = {
  meta: [string, string][];
  lists: ListRow[];
  items: [string, ItemRow[]][];
  ops: { seq: number; pushed: boolean; op: Op }[];
  nextSeq: number;
};

/**
 * Browser implementation for dev/testing (Expo web).
 *
 * Uses sessionStorage so that two tabs on the same origin are fully isolated —
 * they behave like two separate phones, which makes live sync easy to demo.
 * Native builds never load this file (SqliteStorage is used there instead).
 */
export class WebStorage extends MemoryStorage {
  private hasSessionStorage =
    typeof sessionStorage !== 'undefined' && typeof sessionStorage.getItem === 'function';

  override async init(): Promise<void> {
    if (!this.hasSessionStorage) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as Snapshot;
      this.meta = new Map(snap.meta);
      this.lists = new Map(snap.lists.map((l) => [l.id, l]));
      this.items = new Map(snap.items.map(([listId, rows]) => [listId, new Map(rows.map((r) => [r.id, r]))]));
      this.ops = snap.ops;
      this.opIds = new Set(snap.ops.map((o) => o.op.id));
      this.nextSeq = snap.nextSeq;
    } catch {
      // Corrupt snapshot — start fresh rather than crash.
    }
  }

  protected override changed(): void {
    if (!this.hasSessionStorage) return;
    try {
      const snap: Snapshot = {
        meta: [...this.meta],
        lists: [...this.lists.values()],
        items: [...this.items.entries()].map(([listId, bucket]) => [listId, [...bucket.values()]]),
        ops: this.ops,
        nextSeq: this.nextSeq,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      // Quota exceeded / private mode — keep running in memory.
    }
  }
}
