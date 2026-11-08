import { useEffect, useRef, useState } from 'react';
import type { ID } from '../api/types';
import { songsApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { Spinner } from './ui';

type PreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'image' | 'pdf' | 'other'; url: string }
  | { status: 'text'; text: string };

/**
 * Inline preview of a song's private file (fetched with the auth header as a
 * blob). Images and PDFs render in place, text/ChordPro as preformatted text.
 * Loads only once it scrolls near the viewport so long lineups stay light.
 */
export function SongFilePreview({
  songId,
  title,
  load = (signal) => songsApi.file(songId, signal),
}: {
  songId: ID;
  title: string;
  /** How to fetch the file; defaults to the authenticated songs endpoint. */
  load?: (signal: AbortSignal) => Promise<Blob>;
}) {
  // Latest loader without re-fetching on every render (callers pass inline functions).
  const loadRef = useRef(load);
  loadRef.current = load;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: 'idle' });

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const ctrl = new AbortController();
    let url: string | null = null;
    setState({ status: 'loading' });
    loadRef
      .current(ctrl.signal)
      .then(async (blob) => {
        const type = blob.type.split(';')[0].trim().toLowerCase();
        if (type.startsWith('text/')) {
          const text = await blob.text();
          if (!ctrl.signal.aborted) setState({ status: 'text', text });
          return;
        }
        url = URL.createObjectURL(blob);
        if (ctrl.signal.aborted) return;
        const kind = type.startsWith('image/') ? 'image' : type === 'application/pdf' ? 'pdf' : 'other';
        setState({ status: kind, url });
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [visible, songId]);

  return (
    <div ref={ref} className="stand-preview">
      {(state.status === 'idle' || state.status === 'loading') && (
        <div className="stand-preview__placeholder">
          <Spinner label="Loading music…" />
        </div>
      )}
      {state.status === 'error' && <p className="stand-preview__message">Couldn’t load the file: {state.message}</p>}
      {state.status === 'image' && <img className="stand-preview__image" src={state.url} alt={`Music for “${title}”`} />}
      {state.status === 'pdf' && (
        <iframe className="stand-preview__pdf" src={`${state.url}#view=FitH&navpanes=0`} title={`Music for “${title}”`} />
      )}
      {state.status === 'text' && <pre className="stand-preview__text">{state.text}</pre>}
      {state.status === 'other' && <p className="stand-preview__message">This file type can’t be previewed. Use “Open” to view it.</p>}
    </div>
  );
}
