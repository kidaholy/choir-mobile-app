import type { Storage } from './types';
import { WebStorage } from './web';

let instance: Storage | null = null;

/**
 * Web entry (dev/testing only): Metro resolves this file instead of
 * index.ts on web, keeping expo-sqlite/WASM out of the browser bundle.
 * Two tabs share nothing (sessionStorage is per-tab) → two tabs behave
 * like two separate phones.
 */
export async function getStorage(): Promise<Storage> {
  if (instance) return instance;
  instance = new WebStorage();
  await instance.init();
  return instance;
}

export type { Storage } from './types';
