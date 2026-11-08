import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { errorMessage } from '../api/errors';
import { IconAlert, IconRefresh } from './icons';

export function Spinner({ label = 'Loading…', inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={inline ? 'spinner spinner--inline' : 'spinner'} role="status">
      <span className="spinner__ring" aria-hidden="true" />
      <span className={inline ? 'visually-hidden' : 'spinner__label'}>{label}</span>
    </div>
  );
}

export function Skeleton({ lines = 3, cards = 0 }: { lines?: number; cards?: number }) {
  return (
    <div className="skeleton-wrap" aria-hidden="true">
      {cards > 0 ? (
        <div className="card-grid">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton skeleton--title" />
              <div className="skeleton" />
              <div className="skeleton skeleton--short" />
            </div>
          ))}
        </div>
      ) : (
        Array.from({ length: lines }, (_, i) => <div key={i} className={`skeleton ${i % 3 === 2 ? 'skeleton--short' : ''}`} />)
      )}
    </div>
  );
}

/** Loading region: visually a skeleton, announced as "Loading…" to screen readers. */
export function LoadingBlock({ label = 'Loading…', cards = 0, lines = 3 }: { label?: string; cards?: number; lines?: number }) {
  return (
    <div className="loading-block">
      <span className="visually-hidden" role="status">
        {label}
      </span>
      <Skeleton cards={cards} lines={lines} />
    </div>
  );
}

export function ErrorBanner({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (!error) return null;
  return (
    <div className="banner banner--error" role="alert">
      <span className="banner__icon" aria-hidden="true">
        <IconAlert />
      </span>
      <div className="banner__body">
        {title && <strong className="banner__title">{title}</strong>}
        <span>{typeof error === 'string' ? error : errorMessage(error)}</span>
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          <IconRefresh size={16} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="empty-state__title">{title}</h2>
      {children && <div className="empty-state__text">{children}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'secondary', size = 'md', busy = false, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size !== 'md' ? `btn--${size}` : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Chip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className="chip">
      <span>{children}</span>
      {onRemove && (
        <button type="button" className="chip__remove" onClick={onRemove} aria-label={removeLabel ?? 'Remove'}>
          ×
        </button>
      )}
    </span>
  );
}

/** A toggleable chip (aria-pressed) used for tag filters/selection. */
export function ToggleChip({ pressed, onToggle, children }: { pressed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip chip--toggle${pressed ? ' is-pressed' : ''}`} aria-pressed={pressed} onClick={onToggle}>
      {pressed && <span aria-hidden="true">✓ </span>}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="page-header">
      {back && <div className="page-header__back">{back}</div>}
      <div className="page-header__row">
        <div className="page-header__titles">
          <h1 className="page-title" tabIndex={-1} data-page-title>
            {title}
          </h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
