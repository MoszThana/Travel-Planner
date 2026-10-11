// PIN hashing with PBKDF2-SHA256 (Web Crypto, runs on the Cloudflare edge).
// Stored format: pbkdf2$<iterations>$<base64 salt>$<base64 hash>
// Older rows may still hold the plain 4-digit PIN; verifyPin accepts those once and
// reports needsUpgrade so the caller can replace them with a hash.

const ITERATIONS = 100_000; // Cloudflare Workers' PBKDF2 limit
const KEY_BYTES = 32;
const PREFIX = 'pbkdf2';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export const isValidPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{4}$/.test(pin);

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

// Compare without stopping at the first difference
const constantTimeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPin(
  pin: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false };

  if (stored.startsWith(`${PREFIX}$`)) {
    const [, iterations, salt, hash] = stored.split('$');
    const candidate = await derive(pin, fromBase64(salt), Number(iterations));
    return { ok: constantTimeEqual(candidate, fromBase64(hash)), needsUpgrade: false };
  }

  // Legacy plain-text PIN
  const enc = new TextEncoder();
  return { ok: constantTimeEqual(enc.encode(pin), enc.encode(stored)), needsUpgrade: true };
}
