/**
 * Share codes: short, human-typable room identifiers (the list id itself).
 * Ambiguous characters (0/O, 1/I/L) are excluded from the alphabet.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

function randomByte(): number {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.getRandomValues === 'function') {
    const b = new Uint8Array(1);
    c.getRandomValues(b);
    return b[0];
  }
  return Math.floor(Math.random() * 256);
}

export function newShareCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomByte() % ALPHABET.length];
  return out;
}

/** Cleans up user-typed codes ("abc 123-def" → "ABC123DEF"). */
export function normalizeShareCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidShareCode(input: string): boolean {
  const code = normalizeShareCode(input);
  return code.length >= 6 && code.length <= 24;
}
