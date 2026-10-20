import * as Crypto from 'expo-crypto';

/** Stable per-install identifier for this phone (used as LWW origin device id). */
export function newDeviceId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Should not happen with expo-crypto; last-resort fallback.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
