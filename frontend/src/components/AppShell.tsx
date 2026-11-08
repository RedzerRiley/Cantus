import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from '../router';
import { useAuth } from '../auth/AuthContext';
import { IconBook, IconHome, IconList, IconMusic, IconSettings } from './icons';
import { displayName } from '../lib/format';

const NAV = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/songs', label: 'Songbook', icon: IconBook, end: false },
  { to: '/lineups', label: 'Lineups', icon: IconList, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new page's heading after client-side navigation,
  // so screen-reader and keyboard users land at the start of the content.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const t = window.setTimeout(() => {
      // Respect pages that already placed focus inside the content (e.g. a "name" field).
      const active = document.activeElement;
      if (active && active !== mainRef.current && mainRef.current?.contains(active)) return;
      const h1 = mainRef.current?.querySelector<HTMLElement>('[data-page-title]');
      (h1 ?? mainRef.current)?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const skipToContent = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    mainRef.current?.focus();
  };

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={skipToContent}>
        Skip to content
      </a>

      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <IconMusic size={22} />
          </span>
          <span className="brand__name">Cantus</span>
        </div>
        <nav aria-label="Main" className="sidebar__nav">
          <ul className="plain-list">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="sidebar__link">
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {me && (
          <div className="sidebar__footer">
            <span className="sidebar__parish">{me.workspace.name}</span>
            <span className="sidebar__user">
              {displayName(me)} · {me.role === 'admin' ? 'Admin' : 'Member'}
            </span>
          </div>
        )}
      </aside>

      <header className="topbar">
        <span className="brand brand--compact">
          <span className="brand__mark" aria-hidden="true">
            <IconMusic size={18} />
          </span>
          <span className="brand__name">Cantus</span>
        </span>
        {me && <span className="topbar__parish">{me.workspace.name}</span>}
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="main">
        <div className="main__inner">{children}</div>
      </main>

      <nav aria-label="Main" className="tabbar">
        <ul className="plain-list tabbar__list">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className="tabbar__link">
                <Icon size={22} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
