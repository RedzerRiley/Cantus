import type { ReactNode } from 'react';
import { Navigate, RouterProvider, Routes, useLocation, type RouteElement } from './router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { CatalogProvider } from './catalog/CatalogContext';
import { ToastProvider } from './components/Toast';
import { AppShell } from './components/AppShell';
import { ErrorBanner, Spinner } from './components/ui';
import type { RouteDef } from './lib/routeMatch';
import { matchPath, safeNextPath } from './lib/routeMatch';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { SongbookPage } from './pages/SongbookPage';
import { LineupsPage } from './pages/LineupsPage';
import { LineupEditorPage } from './pages/LineupEditorPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SharedLineupPage } from './pages/SharedLineupPage';

const PUBLIC_ROUTES: RouteDef<RouteElement>[] = [
  { path: '/login', value: () => <LoginPage /> },
  { path: '/register', value: () => <RegisterPage /> },
];

const APP_ROUTES: RouteDef<RouteElement>[] = [
  { path: '/', value: () => <HomePage /> },
  { path: '/songs', value: () => <SongbookPage /> },
  { path: '/lineups', value: () => <LineupsPage /> },
  { path: '/lineups/new', value: () => <LineupEditorPage key="new" lineupId={null} /> },
  {
    path: '/lineups/:id',
    value: ({ id }) => {
      const n = Number(id);
      return Number.isInteger(n) && n > 0 ? <LineupEditorPage key={n} lineupId={n} /> : <NotFoundPage />;
    },
  },
  { path: '/settings', value: () => <SettingsPage /> },
];

function FullPage({ children }: { children: ReactNode }) {
  return <div className="full-page">{children}</div>;
}

function Gate() {
  const { status, bootError, retryBoot } = useAuth();
  const { pathname, search } = useLocation();
  const isPublic = PUBLIC_ROUTES.some((r) => r.path === pathname);

  // Shared lineup links work for everyone, signed in or not.
  const shared = matchPath('/share/:token', pathname);
  if (shared?.token) return <SharedLineupPage key={shared.token} token={shared.token} />;

  if (status === 'loading') {
    return (
      <FullPage>
        {bootError ? (
          <main className="auth-card">
            <h1 className="page-title">Cantus</h1>
            <ErrorBanner error={bootError} onRetry={retryBoot} title="Couldn’t load your account" />
          </main>
        ) : (
          <Spinner label="Opening Cantus…" />
        )}
      </FullPage>
    );
  }

  if (status === 'anonymous') {
    if (isPublic) return <Routes routes={PUBLIC_ROUTES} fallback={null} />;
    const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return <Navigate to={`/login${next}`} />;
  }

  if (isPublic) {
    return <Navigate to={safeNextPath(new URLSearchParams(search).get('next'))} />;
  }

  return (
    <CatalogProvider>
      <AppShell>
        <Routes routes={APP_ROUTES} fallback={<NotFoundPage />} />
      </AppShell>
    </CatalogProvider>
  );
}

export function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  );
}
