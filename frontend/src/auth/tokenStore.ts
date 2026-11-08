// Token persistence + a tiny pub/sub so the API client can signal "401 happened"
// without importing React.

const KEY = 'cantus.token';
let memoryToken: string | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // e.g. storage disabled / private mode
  }
}

export function getToken(): string | null {
  const s = storage();
  if (s) {
    try {
      return s.getItem(KEY);
    } catch {
      /* fall through */
    }
  }
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    storage()?.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnauthorized(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitUnauthorized(): void {
  listeners.forEach((l) => l());
}
