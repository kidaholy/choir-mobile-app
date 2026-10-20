import type { ItemInfo, ItemRow, ListInfo, ListRow, Op } from '../sync/types';
import type { Storage } from './types';

type StoredOp = { seq: number; pushed: boolean; op: Op };

/** In-memory Storage used by tests (and as the base of WebStorage). */
export class MemoryStorage implements Storage {
  protected meta = new Map<string, string>();
  protected lists = new Map<string, ListRow>();
  protected items = new Map<string, Map<string, ItemRow>>();
  protected ops: StoredOp[] = [];
  protected opIds = new Set<string>();
  protected nextSeq = 1;

  async init(): Promise<void> {}

  /** Hook for subclasses that persist to a backing store. */
  protected changed(): void {}

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
    this.changed();
  }

  async getListIds(): Promise<string[]> {
    return [...this.lists.values()].filter((l) => !l.deleted).map((l) => l.id);
  }

  async getLists(): Promise<ListInfo[]> {
    return [...this.lists.values()]
      .filter((l) => !l.deleted)
      .map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getListRow(id: string): Promise<ListRow | null> {
    return this.lists.get(id) ?? null;
  }

  async putListRow(row: ListRow): Promise<void> {
    this.lists.set(row.id, row);
    this.changed();
  }

  async getItems(listId: string): Promise<ItemInfo[]> {
    const rows = [...(this.items.get(listId)?.values() ?? [])]
      .filter((i) => !i.deleted)
      .map((i) => ({ id: i.id, listId: i.listId, text: i.text, done: i.done, createdAt: i.createdAt }))
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    return rows;
  }

  async getItemRow(listId: string, id: string): Promise<ItemRow | null> {
    return this.items.get(listId)?.get(id) ?? null;
  }

  async putItemRow(row: ItemRow): Promise<void> {
    let bucket = this.items.get(row.listId);
    if (!bucket) {
      bucket = new Map();
      this.items.set(row.listId, bucket);
    }
    bucket.set(row.id, row);
    this.changed();
  }

  async hasOp(opId: string): Promise<boolean> {
    return this.opIds.has(opId);
  }

  async appendOp(op: Op, pushed: boolean): Promise<void> {
    if (this.opIds.has(op.id)) return;
    this.opIds.add(op.id);
    this.ops.push({ seq: this.nextSeq++, pushed, op });
    this.changed();
  }

  async getOps(listId: string): Promise<Op[]> {
    return this.ops.filter((o) => o.op.listId === listId).sort((a, b) => a.seq - b.seq).map((o) => o.op);
  }

  async getUnpushedOps(): Promise<Op[]> {
    return this.ops.filter((o) => !o.pushed).sort((a, b) => a.seq - b.seq).map((o) => o.op);
  }

  async markOpsPushed(opIds: string[]): Promise<void> {
    let dirty = false;
    for (const id of opIds) {
      if (!this.opIds.has(id)) continue;
      for (const entry of this.ops) {
        if (entry.op.id === id && !entry.pushed) {
          entry.pushed = true;
          dirty = true;
        }
      }
    }
    if (dirty) this.changed();
  }
}
