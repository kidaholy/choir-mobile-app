import * as SQLite from 'expo-sqlite';

import type { ItemInfo, ItemRow, ListInfo, ListRow, Op, Stamp } from '../sync/types';
import type { Storage } from './types';

const stampToJson = (s: Stamp): string => JSON.stringify(s);
const stampFromJson = (s: string): Stamp => JSON.parse(s) as Stamp;

type ListDbRow = {
  id: string;
  name: string;
  name_u: string;
  deleted: number;
  deleted_u: string;
  created_at: number;
};

type ItemDbRow = {
  list_id: string;
  id: string;
  text: string;
  text_u: string;
  done: number;
  done_u: string;
  deleted: number;
  deleted_u: string;
  created_at: number;
};

const toListRow = (r: ListDbRow): ListRow => ({
  id: r.id,
  name: r.name,
  nameU: stampFromJson(r.name_u),
  deleted: r.deleted === 1,
  deletedU: stampFromJson(r.deleted_u),
  createdAt: r.created_at,
});

const toItemRow = (r: ItemDbRow): ItemRow => ({
  listId: r.list_id,
  id: r.id,
  text: r.text,
  textU: stampFromJson(r.text_u),
  done: r.done === 1,
  doneU: stampFromJson(r.done_u),
  deleted: r.deleted === 1,
  deletedU: stampFromJson(r.deleted_u),
  createdAt: r.created_at,
});

/**
 * The phone's local database (expo-sqlite / SQLite).
 * Nothing here ever talks to a network — only this device's disk.
 */
export class SqliteStorage implements Storage {
  private db: SQLite.SQLiteDatabase | null = null;

  private get conn(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('SqliteStorage.init() has not completed');
    return this.db;
  }

  async init(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync('shared-lists.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        name_u TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_u TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        list_id TEXT NOT NULL,
        id TEXT NOT NULL,
        text TEXT NOT NULL,
        text_u TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        done_u TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_u TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (list_id, id)
      );
      CREATE TABLE IF NOT EXISTS ops (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op_id TEXT NOT NULL UNIQUE,
        list_id TEXT NOT NULL,
        pushed INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ops_list_idx ON ops (list_id);
      CREATE INDEX IF NOT EXISTS ops_pushed_idx ON ops (pushed);
    `);
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.conn.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.conn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  async getListIds(): Promise<string[]> {
    const rows = await this.conn.getAllAsync<{ id: string }>('SELECT id FROM lists WHERE deleted = 0');
    return rows.map((r) => r.id);
  }

  async getLists(): Promise<ListInfo[]> {
    const rows = await this.conn.getAllAsync<ListDbRow>(
      'SELECT * FROM lists WHERE deleted = 0 ORDER BY created_at DESC',
    );
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  async getListRow(id: string): Promise<ListRow | null> {
    const row = await this.conn.getFirstAsync<ListDbRow>('SELECT * FROM lists WHERE id = ?', id);
    return row ? toListRow(row) : null;
  }

  async putListRow(row: ListRow): Promise<void> {
    await this.conn.runAsync(
      `INSERT INTO lists (id, name, name_u, deleted, deleted_u, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, name_u = excluded.name_u,
         deleted = excluded.deleted, deleted_u = excluded.deleted_u,
         created_at = excluded.created_at`,
      row.id,
      row.name,
      stampToJson(row.nameU),
      row.deleted ? 1 : 0,
      stampToJson(row.deletedU),
      row.createdAt,
    );
  }

  async getItems(listId: string): Promise<ItemInfo[]> {
    const rows = await this.conn.getAllAsync<ItemDbRow>(
      'SELECT * FROM items WHERE list_id = ? AND deleted = 0 ORDER BY created_at ASC, id ASC',
      listId,
    );
    return rows.map((r) => ({
      id: r.id,
      listId: r.list_id,
      text: r.text,
      done: r.done === 1,
      createdAt: r.created_at,
    }));
  }

  async getItemRow(listId: string, id: string): Promise<ItemRow | null> {
    const row = await this.conn.getFirstAsync<ItemDbRow>(
      'SELECT * FROM items WHERE list_id = ? AND id = ?',
      listId,
      id,
    );
    return row ? toItemRow(row) : null;
  }

  async putItemRow(row: ItemRow): Promise<void> {
    await this.conn.runAsync(
      `INSERT INTO items (list_id, id, text, text_u, done, done_u, deleted, deleted_u, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(list_id, id) DO UPDATE SET
         text = excluded.text, text_u = excluded.text_u,
         done = excluded.done, done_u = excluded.done_u,
         deleted = excluded.deleted, deleted_u = excluded.deleted_u,
         created_at = excluded.created_at`,
      row.listId,
      row.id,
      row.text,
      stampToJson(row.textU),
      row.done ? 1 : 0,
      stampToJson(row.doneU),
      row.deleted ? 1 : 0,
      stampToJson(row.deletedU),
      row.createdAt,
    );
  }

  async hasOp(opId: string): Promise<boolean> {
    const row = await this.conn.getFirstAsync<{ n: number }>('SELECT 1 AS n FROM ops WHERE op_id = ?', opId);
    return row != null;
  }

  async appendOp(op: Op, pushed: boolean): Promise<void> {
    await this.conn.runAsync(
      'INSERT OR IGNORE INTO ops (op_id, list_id, pushed, payload) VALUES (?, ?, ?, ?)',
      op.id,
      op.listId,
      pushed ? 1 : 0,
      JSON.stringify(op),
    );
  }

  async getOps(listId: string): Promise<Op[]> {
    const rows = await this.conn.getAllAsync<{ payload: string }>(
      'SELECT payload FROM ops WHERE list_id = ? ORDER BY seq ASC',
      listId,
    );
    return rows.map((r) => JSON.parse(r.payload) as Op);
  }

  async getUnpushedOps(): Promise<Op[]> {
    const rows = await this.conn.getAllAsync<{ payload: string }>(
      'SELECT payload FROM ops WHERE pushed = 0 ORDER BY seq ASC',
    );
    return rows.map((r) => JSON.parse(r.payload) as Op);
  }

  async markOpsPushed(opIds: string[]): Promise<void> {
    if (opIds.length === 0) return;
    const placeholders = opIds.map(() => '?').join(', ');
    await this.conn.runAsync(
      `UPDATE ops SET pushed = 1 WHERE op_id IN (${placeholders})`,
      ...opIds,
    );
  }
}
