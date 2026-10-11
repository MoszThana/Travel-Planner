import { getRequestContext } from '@cloudflare/next-on-pages';

// Signed login session stored in an HttpOnly cookie.
// Cookie value: <userId>.<expiresAtSeconds>.<base64url HMAC-SHA256 signature>
// Uses Web Crypto only, so it runs on the Cloudflare edge runtime.

export const SESSION_COOKIE = 'tp_session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (decision D3)

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

function getSecret(): string {
  const secret = (getRequestContext().env as any).SESSION_SECRET as string | undefined;
  if (!secret || secret.length < 32) {
    // Fail closed: never sign sessions with a missing or weak secret
    throw new Error('SESSION_SECRET is not configured (needs at least 32 characters).');
  }
  return secret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

const cookieAttributes = (maxAge: number) =>
  `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/** Set-Cookie header value that logs the user in for SESSION_MAX_AGE. */
export async function createSessionCookie(userId: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${userId}.${expiresAt}`;
  const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload));
  return `${SESSION_COOKIE}=${payload}.${toBase64Url(signature)}; ${cookieAttributes(SESSION_MAX_AGE)}`;
}

/** Set-Cookie header value that logs the user out. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** The logged-in user's id, or null if there is no valid, unexpired session. */
export async function getSessionUserId(request: Request): Promise<string | null> {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;

  if (!userId || !/^\d+$/.test(expiresAt) || Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return null;
  }

  try {
    // crypto.subtle.verify compares in constant time
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getKey(),
      fromBase64Url(signature) as BufferSource,
      encoder.encode(`${userId}.${expiresAt}`)
    );
    return valid ? userId : null;
  } catch {
    return null;
  }
}
