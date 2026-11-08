import type { ReactNode } from 'react';
import { IconMusic } from '../components/icons';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="full-page auth-page">
      <main id="main" className="auth-card" tabIndex={-1}>
        <div className="brand brand--auth">
          <span className="brand__mark" aria-hidden="true">
            <IconMusic size={26} />
          </span>
          <span className="brand__name">Cantus</span>
        </div>
        <h1 className="page-title" data-page-title tabIndex={-1}>
          {title}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {children}
        {footer && <div className="auth-card__footer">{footer}</div>}
      </main>
    </div>
  );
}
