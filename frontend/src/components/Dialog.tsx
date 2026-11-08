import { useEffect, useId, useRef, type ReactNode, type MouseEvent } from 'react';
import { IconX } from './icons';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Full-screen sheet on small screens (default true for md/lg). */
  sheetOnMobile?: boolean;
  /** Prevent closing via Esc/backdrop/close button (e.g. while saving). */
  dismissible?: boolean;
  className?: string;
}

/**
 * Accessible modal built on native <dialog>.showModal(): the browser provides
 * the focus trap, inert background and Esc handling. Focus returns to the
 * element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  sheetOnMobile,
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', ''); // jsdom / very old browsers
      document.documentElement.classList.add('has-modal');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  // Restore focus & body scroll whenever the dialog actually closes.
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    const handleClose = () => {
      document.documentElement.classList.remove('has-modal');
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target && document.contains(target)) target.focus();
      onCloseRef.current();
    };
    const handleCancel = (e: Event) => {
      if (!dismissibleRef.current) e.preventDefault();
    };
    d.addEventListener('close', handleClose);
    d.addEventListener('cancel', handleCancel);
    return () => {
      d.removeEventListener('close', handleClose);
      d.removeEventListener('cancel', handleCancel);
    };
  }, []);

  // Clean up if unmounted while open.
  useEffect(() => () => document.documentElement.classList.remove('has-modal'), []);

  const requestClose = () => {
    if (!dismissible) return;
    const d = ref.current;
    if (d && typeof d.close === 'function' && d.open) d.close();
    else onClose();
  };

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) requestClose();
  };

  const sheet = sheetOnMobile ?? size !== 'sm';
  const cls = ['dialog', `dialog--${size}`, sheet ? 'dialog--sheet' : '', className].filter(Boolean).join(' ');

  return (
    <dialog ref={ref} className={cls} aria-labelledby={titleId} aria-describedby={description ? descId : undefined} onClick={onBackdropClick}>
      {open && (
        <div className="dialog__inner">
          <div className="dialog__header">
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            <button type="button" className="icon-btn" onClick={requestClose} aria-label="Close dialog" disabled={!dismissible}>
              <IconX />
            </button>
          </div>
          {description && (
            <p id={descId} className="dialog__description">
              {description}
            </p>
          )}
          <div className="dialog__body">{children}</div>
          {footer && <div className="dialog__footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
