import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api/endpoints';
import type { LoginInput, Me, RegisterInput } from '../api/types';
import { clearToken, getToken, onUnauthorized, setToken } from './tokenStore';
import { useNavigate } from '../router';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  /** Error loading the profile on boot (other than 401), e.g. server down. */
  bootError: unknown;
  retryBoot: () => void;
  login: (input: LoginInput) => Promise<Me>;
  register: (input: RegisterInput) => Promise<Me>;
  logout: () => Promise<void>;
  setMe: (me: Me) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'anonymous'));
  const [bootError, setBootError] = useState<unknown>(null);
  const [bootTick, setBootTick] = useState(0);
  const navigate = useNavigate();

  // Load the current user on boot when a token exists.
  useEffect(() => {
    if (!getToken()) {
      setStatus('anonymous');
      return undefined;
    }
    const controller = new AbortController();
    setBootError(null);
    setStatus('loading');
    authApi
      .me(controller.signal)
      .then((user) => {
        setMeState(user);
        setStatus('authenticated');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (!getToken()) {
          setStatus('anonymous'); // 401 already cleared the token
        } else {
          setBootError(err);
        }
      });
    return () => controller.abort();
  }, [bootTick]);

  // Any 401 anywhere: drop the session and go to /login.
  useEffect(
    () =>
      onUnauthorized(() => {
        setMeState(null);
        setStatus('anonymous');
        if (!PUBLIC_PATHS.includes(window.location.pathname)) {
          const next = window.location.pathname + window.location.search;
          navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true, force: true });
        }
      }),
    [navigate],
  );

  const login = useCallback(async (input: LoginInput) => {
    const res = await authApi.login(input);
    setToken(res.token);
    setMeState(res.user);
    setBootError(null);
    setStatus('authenticated');
    return res.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await authApi.register(input);
    setToken(res.token);
    setMeState(res.user);
    setBootError(null);
    setStatus('authenticated');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getToken()) await authApi.logout();
    } catch {
      /* token may already be invalid — logging out locally is what matters */
    }
    clearToken();
    setMeState(null);
    setStatus('anonymous');
    navigate('/login', { replace: true, force: true });
  }, [navigate]);

  const setMe = useCallback((next: Me) => setMeState(next), []);
  const retryBoot = useCallback(() => setBootTick((t) => t + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, bootError, retryBoot, login, register, logout, setMe, isAdmin: me?.role === 'admin' }),
    [status, me, bootError, retryBoot, login, register, logout, setMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages rendered only when authenticated. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe called while signed out');
  return me;
}
