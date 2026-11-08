export type Params = Record<string, string>;

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

/**
 * Match a pathname against a pattern such as "/lineups/:id".
 * - Segments starting with ":" capture (URL-decoded) values.
 * - "*" as the final segment matches anything (captured as params["*"]).
 * - Trailing slashes are ignored. Matching is case-sensitive for params,
 *   case-insensitive for static segments.
 */
export function matchPath(pattern: string, pathname: string): Params | null {
  const pSegs = trimSlashes(pattern).split('/').filter(Boolean);
  const uSegs = trimSlashes(pathname.split(/[?#]/)[0] ?? '').split('/').filter(Boolean);
  const params: Params = {};

  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i] as string;
    if (p === '*') {
      params['*'] = uSegs.slice(i).map(safeDecode).join('/');
      return params;
    }
    const u = uSegs[i];
    if (u === undefined) return null;
    if (p.startsWith(':')) {
      params[p.slice(1)] = safeDecode(u);
    } else if (p.toLowerCase() !== u.toLowerCase()) {
      return null;
    }
  }
  return uSegs.length === pSegs.length ? params : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface RouteDef<T> {
  path: string;
  value: T;
}

/** First matching route (in declaration order), or null. */
export function matchRoutes<T>(routes: ReadonlyArray<RouteDef<T>>, pathname: string): { route: RouteDef<T>; params: Params } | null {
  for (const route of routes) {
    const params = matchPath(route.path, pathname);
    if (params) return { route, params };
  }
  return null;
}

/** Only allow same-app relative redirects (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/**
 * Token of a shared-lineup link, or null if the location isn't one.
 * Two forms are accepted:
 *   /share/<token>   (pretty; needs the host to send unknown paths to index.html)
 *   /?share=<token>  (works on any static host, even without that rewrite rule)
 */
export function shareTokenFromLocation(pathname: string, search: string): string | null {
  const pretty = matchPath('/share/:token', pathname)?.token;
  if (pretty) return pretty;
  if (matchPath('/', pathname)) {
    const token = new URLSearchParams(search).get('share')?.trim();
    if (token) return token;
  }
  return null;
}
