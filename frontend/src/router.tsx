import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { matchRoutes, type Params, type RouteDef } from './lib/routeMatch';

export interface Location {
  pathname: string;
  search: string;
  state: unknown;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  /** Skip navigation blockers (e.g. after saving, or on forced logout). */
  force?: boolean;
}

export type NavigateFn = (to: string, opts?: NavigateOptions) => boolean;

interface Blocker {
  message: string;
}

interface RouterContextValue {
  location: Location;
  navigate: NavigateFn;
  registerBlocker: (b: Blocker) => () => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function readLocation(): Location {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    state: (window.history.state as { usr?: unknown } | null)?.usr ?? null,
  };
}

export interface RouterProviderProps {
  children: ReactNode;
  /** Injected for tests; defaults to window.confirm. */
  confirm?: (message: string) => boolean;
}

export function RouterProvider({ children, confirm = (m) => window.confirm(m) }: RouterProviderProps) {
  const [location, setLocation] = useState<Location>(readLocation);
  const blockers = useRef<Set<Blocker>>(new Set());
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const currentUrl = useRef(window.location.pathname + window.location.search);

  const shouldProceed = useCallback((): boolean => {
    const active = [...blockers.current];
    if (active.length === 0) return true;
    return confirmRef.current((active[active.length - 1] as Blocker).message);
  }, []);

  const navigate = useCallback<NavigateFn>(
    (to, opts = {}) => {
      const target = new URL(to, window.location.origin);
      const next = target.pathname + target.search;
      if (!opts.force && next !== currentUrl.current && !shouldProceed()) return false;
      const histState = { usr: opts.state ?? null };
      if (opts.replace) window.history.replaceState(histState, '', next + target.hash);
      else window.history.pushState(histState, '', next + target.hash);
      currentUrl.current = next;
      setLocation({ pathname: target.pathname, search: target.search, state: opts.state ?? null });
      if (!opts.replace) window.scrollTo?.(0, 0);
      return true;
    },
    [shouldProceed],
  );

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname + window.location.search;
      if (next === currentUrl.current) return;
      if (!shouldProceed()) {
        // Undo the browser navigation: put the previous URL back.
        window.history.pushState(window.history.state, '', currentUrl.current);
        return;
      }
      currentUrl.current = next;
      setLocation(readLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [shouldProceed]);

  const registerBlocker = useCallback((b: Blocker) => {
    blockers.current.add(b);
    return () => {
      blockers.current.delete(b);
    };
  }, []);

  const value = useMemo(() => ({ location, navigate, registerBlocker }), [location, navigate, registerBlocker]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('Router hooks must be used inside <RouterProvider>');
  return ctx;
}

export const useLocation = (): Location => useRouter().location;
export const useNavigate = (): NavigateFn => useRouter().navigate;

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/**
 * Ask for confirmation before leaving while `when` is true —
 * covers in-app links, back/forward, and tab close/reload (beforeunload).
 */
export function useBlocker(when: boolean, message = 'You have unsaved changes. Leave without saving?'): void {
  const { registerBlocker } = useRouter();
  useEffect(() => {
    if (!when) return undefined;
    const unregister = registerBlocker({ message });
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [when, message, registerBlocker]);
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
  state?: unknown;
}

export function Link({ to, replace, state, onClick, target, children, ...rest }: LinkProps) {
  const navigate = useNavigate();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== '_self') return;
    e.preventDefault();
    navigate(to, { replace, state });
  };
  return (
    <a href={to} onClick={handleClick} target={target} {...rest}>
      {children}
    </a>
  );
}

/** Like Link, but sets aria-current="page" when the route is active. */
export function NavLink({ to, end = false, className, ...rest }: LinkProps & { end?: boolean }) {
  const { pathname } = useLocation();
  const active = end ? pathname === to : pathname === to || pathname.startsWith(to.endsWith('/') ? to : `${to}/`);
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={[className, active ? 'is-active' : ''].filter(Boolean).join(' ')} {...rest} />
  );
}

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace, force: true });
  }, [navigate, to, replace]);
  return null;
}

export type RouteElement = (params: Params) => ReactNode;

const ParamsContext = createContext<Params>({});
export const useParams = (): Params => useContext(ParamsContext);

/** Render the first matching route; `fallback` is shown when nothing matches (404). */
export function Routes({ routes, fallback }: { routes: ReadonlyArray<RouteDef<RouteElement>>; fallback: ReactNode }) {
  const { pathname } = useLocation();
  const match = matchRoutes(routes, pathname);
  if (!match) return <>{fallback}</>;
  return <ParamsContext.Provider value={match.params}>{match.route.value(match.params)}</ParamsContext.Provider>;
}
