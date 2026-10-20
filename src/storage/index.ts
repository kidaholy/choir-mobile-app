import type { Storage } from './types';
import { SqliteStorage } from './sqlite';

let instance: Storage | null = null;

/**
 * Native entry: the phone's local SQLite database (expo-sqlite).
 * On web, Metro resolves index.web.ts instead — never this file.
 */
export async function getStorage(): Promise<Storage> {
  if (instance) return instance;
  instance = new SqliteStorage();
  await instance.init();
  return instance;
}

export type { Storage } from './types';
