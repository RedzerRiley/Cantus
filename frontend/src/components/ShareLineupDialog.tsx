import { useRef, useState } from 'react';
import type { ID } from '../api/types';
import { lineupsApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { Dialog } from './Dialog';
import { FormErrors } from './FormField';
import { Button } from './ui';
import { IconCheck, IconCopy, IconLink } from './icons';
import { useToast } from './Toast';

export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${encodeURIComponent(token)}`;
}

export interface ShareLineupDialogProps {
  open: boolean;
  onClose: () => void;
  lineupId: ID;
  lineupName: string;
  token: string | null;
  onTokenChange: (token: string | null) => void;
}

export function ShareLineupDialog({ open, onClose, lineupId, lineupName, token, onTokenChange }: ShareLineupDialogProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<'create' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const url = token ? shareUrl(token) : '';

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      const res = await lineupsApi.share(lineupId);
      onTokenChange(res.share_token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    setBusy('stop');
    setError(null);
    try {
      await lineupsApi.unshare(lineupId);
      onTokenChange(null);
      setCopied(false);
      toast.success('Sharing turned off — the old link no longer works');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked (e.g. non-secure origin): select so the user can copy manually.
      inputRef.current?.select();
      toast.error('Couldn’t copy automatically — press Cmd/Ctrl + C to copy the selected link.');
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => {
    navigator.share({ title: lineupName, url }).catch(() => {
      /* user cancelled */
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Share lineup" size="sm" dismissible={busy === null}>
      <div className="form-stack share-dialog">
        <FormErrors messages={error ? [error] : undefined} />
        {token ? (
          <>
            <p>Anyone with this link can view “{lineupName}” in music stand mode — no account needed. They can’t make changes.</p>
            <div className="share-dialog__row">
              <label htmlFor="share-url" className="visually-hidden">
                Share link
              </label>
              <input id="share-url" ref={inputRef} className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="primary" icon={copied ? <IconCheck size={18} /> : <IconCopy size={18} />} onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="small muted">Song titles, notes and attached files are visible to anyone who has the link. Changes you save show up on the link automatically.</p>
            <div className="dialog__actions share-dialog__actions">
              <Button variant="ghost" className="share-dialog__stop" busy={busy === 'stop'} onClick={() => void stop()}>
                Stop sharing
              </Button>
              {canNativeShare && (
                <Button icon={<IconLink size={18} />} onClick={nativeShare}>
                  Share…
                </Button>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <p>Create a link so singers and musicians can view this lineup — songs, keys, notes and attached music — without signing in.</p>
            <p className="small muted">You can turn the link off at any time.</p>
            <div className="dialog__actions share-dialog__actions">
              <Button onClick={onClose} disabled={busy !== null}>
                Cancel
              </Button>
              <Button variant="primary" icon={<IconLink size={18} />} busy={busy === 'create'} onClick={() => void create()}>
                Create link
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
