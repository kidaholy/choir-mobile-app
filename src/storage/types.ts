import type { ItemInfo, ItemRow, ListInfo, ListRow, Op } from '../sync/types';

/**
 * Persistence interface. Data never leaves the device through this layer —
 * it only reads/writes local storage.
 *
 * Implementations:
 * - SqliteStorage: native apps (expo-sqlite) — the phone's local database.
 * - WebStorage: browser dev/testing fallback (sessionStorage, per-tab so two
 *   browser tabs behave like two separate phones).
 * - MemoryStorage: tests.
 */
export interface Storage {
  init(): Promise<void>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  /** All list ids this device knows (the relay rooms to join). */
  getListIds(): Promise<string[]>;
  getLists(): Promise<ListInfo[]>;
  getListRow(id: string): Promise<ListRow | null>;
  putListRow(row: ListRow): Promise<void>;

  getItems(listId: string): Promise<ItemInfo[]>;
  getItemRow(listId: string, id: string): Promise<ItemRow | null>;
  putItemRow(row: ItemRow): Promise<void>;

  hasOp(opId: string): Promise<boolean>;
  /** Append to the op log. `pushed=false` means "not yet broadcast to the relay". */
  appendOp(op: Op, pushed: boolean): Promise<void>;
  getOps(listId: string): Promise<Op[]>;
  getUnpushedOps(): Promise<Op[]>;
  markOpsPushed(opIds: string[]): Promise<void>;
}
