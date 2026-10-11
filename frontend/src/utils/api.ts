const BACKEND_URL = '/api';

// JSON API helper. Throws an Error with the server's message when the request fails.
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection and try again.");
  }

  if (!res.ok) {
    // Session expired or missing: let AuthContext send the user back to login
    if (res.status === 401 && typeof window !== 'undefined' && !endpoint.startsWith('/users/login')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return await res.json();
}

/** Tell the user an action failed. One place to swap for an in-app message later. */
export function showError(err: unknown, fallback = 'Something went wrong. Please try again.') {
  const message = err instanceof Error && err.message ? err.message : fallback;
  if (typeof window !== 'undefined') window.alert(message);
}

// Remove data left by the old "offline mode", which saved fake copies in the browser
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('offline_trips');
    localStorage.removeItem('offline_active_trip_id');
  } catch {
    // Storage unavailable (private mode): nothing to clean
  }
}
