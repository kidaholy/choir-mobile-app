import type { Storage } from '../storage/types';
import { createFirebaseTransport } from './firebase-transport';

export type SyncMode = 'firebase' | 'supabase' | 'relay';

/**
 * Default relay endpoint for the fully-offline / same-Wi-Fi mode. Point it at
 * any machine running `node server/relay.mjs` — for real phones that means the
 * computer's LAN IP.
 */
export const DEFAULT_RELAY_URL = 'ws://localhost:8787';

/**
 * Supabase project credentials baked into the build.
 */
export const ENV_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const ENV_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Firebase Realtime Database credentials baked into the build.
 */
export const ENV_FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '';
export const ENV_FIREBASE_AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '';
export const ENV_FIREBASE_DATABASE_URL = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '';
export const ENV_FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';

export type SyncConfig = {
  mode: SyncMode;
  /** True when the user has not forced a mode and Firebase is usable. */
  auto: boolean;
  relayUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Whether Supabase is configured well enough to actually be chosen. */
  supabaseReady: boolean;
  firebaseReady: boolean;
};

export const getTransport = (shareCode: string) => {
  return createFirebaseTransport ? createFirebaseTransport(shareCode) : null;
};

/**
 * Resolve what to sync through.
 */
export async function loadSyncConfig(storage: Storage): Promise<SyncConfig> {
  const [modePref, relayUrl, storedUrl, storedKey] = await Promise.all([
    storage.getMeta('syncMode'),
    storage.getMeta('relayUrl'),
    storage.getMeta('supabaseUrl'),
    storage.getMeta('supabaseAnonKey'),
  ]);

  const supabaseUrl = storedUrl || ENV_SUPABASE_URL;
  const supabaseAnonKey = storedKey || ENV_SUPABASE_ANON_KEY;
  const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);
  const firebaseReady = Boolean(ENV_FIREBASE_DATABASE_URL && ENV_FIREBASE_API_KEY);

  // Prefer Firebase if configured, otherwise fall back to Supabase, then relay
  const explicit = modePref === 'firebase' || modePref === 'supabase' || modePref === 'relay';
  const mode: SyncMode = explicit
    ? (modePref as SyncMode)
    : firebaseReady
      ? 'firebase'
      : supabaseReady
        ? 'supabase'
        : 'relay';

  return {
    mode,
    auto: !explicit,
    relayUrl: relayUrl || DEFAULT_RELAY_URL,
    supabaseUrl,
    supabaseAnonKey,
    supabaseReady,
    firebaseReady,
  };
}
