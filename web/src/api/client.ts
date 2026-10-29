export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3100';

const TOKEN_KEY = 'bma.token';
const TOKEN_EVENT = 'bma:token';

/** Guest token in localStorage; storage can be unavailable (private mode), so every access is guarded. */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore: the session just won't survive a reload
    }
    window.dispatchEvent(new Event(TOKEN_EVENT));
  },
  subscribe(cb: () => void): () => void {
    window.addEventListener(TOKEN_EVENT, cb);
    window.addEventListener('storage', cb);
    return () => {
      window.removeEventListener(TOKEN_EVENT, cb);
      window.removeEventListener('storage', cb);
    };
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return fallback;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running?", 0);
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) tokenStore.set(null); // stale or revoked session
    const retryAfter = Number(res.headers.get('retry-after')) || undefined;
    throw new ApiError(messageFrom(body, res.statusText), res.status, retryAfter);
  }
  return body as T;
}

/** Human-readable text for an error shown in the UI. */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (err.status) {
    case 429:
      return `${err.message}. Try again in ${err.retryAfter ?? 60}s.`;
    case 502:
    case 504:
      return 'The agent is having trouble right now. Try again in a moment.';
    default:
      return err.message;
  }
}
