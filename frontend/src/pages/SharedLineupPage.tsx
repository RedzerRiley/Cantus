import { useCallback, useEffect, useState } from 'react';
import type { ID, PublicLineup } from '../api/types';
import { publicApi } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { MusicStand } from '../components/MusicStand';
import { EmptyState, ErrorBanner, LoadingBlock } from '../components/ui';
import { IconLink, IconMusic } from '../components/icons';

/** Public, read-only music stand view of a shared lineup. No account needed. */
export function SharedLineupPage({ token }: { token: string }) {
  const [lineup, setLineup] = useState<PublicLineup | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useDocumentTitle(lineup?.name ?? 'Shared lineup');

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    publicApi
      .lineup(token, ctrl.signal)
      .then(setLineup)
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
  }, [token, tick]);

  const loadFile = useCallback((songId: ID, signal?: AbortSignal) => publicApi.file(token, songId, signal), [token]);

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="shared-page">
      <header className="shared-page__bar">
        <span className="brand brand--compact">
          <span className="brand__mark" aria-hidden="true">
            <IconMusic size={18} />
          </span>
          <span className="brand__name">Cantus</span>
        </span>
        {lineup && <span className="shared-page__from small muted">Shared by {lineup.workspace_name}</span>}
      </header>

      <main className="shared-page__main">
        {error ? (
          notFound ? (
            <EmptyState icon={<IconLink size={32} />} title="This link isn’t working">
              <p>The lineup may no longer be shared, or the link was copied incorrectly. Ask whoever sent it for a new link.</p>
            </EmptyState>
          ) : (
            <ErrorBanner error={error} onRetry={() => setTick((t) => t + 1)} title="Couldn’t load this lineup" />
          )
        ) : !lineup ? (
          <LoadingBlock label="Loading lineup…" lines={6} />
        ) : (
          <>
            <header className="page-header">
              <div className="page-header__titles">
                <h1 className="page-title">{lineup.name}</h1>
                {lineup.description && <p className="page-subtitle">{lineup.description}</p>}
              </div>
            </header>
            <MusicStand
              loadFile={loadFile}
              items={lineup.items.map((it) => ({
                key: it.id,
                songId: it.song,
                title: it.song_detail.title,
                composer: it.song_detail.composer,
                label: it.label,
                musicKey: it.key.trim() || it.song_detail.key,
                notes: it.notes,
                hasFile: it.song_detail.has_file,
                color: it.song_detail.color,
              }))}
            />
          </>
        )}
      </main>
    </div>
  );
}
