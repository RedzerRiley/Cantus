import { dashboardApi } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../auth/AuthContext';
import { Link } from '../router';
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { LineupCard } from '../components/LineupCard';
import { IconBook, IconFile, IconList, IconPlus } from '../components/icons';
import { formatRelativeTime, pluralize } from '../lib/format';

export function HomePage() {
  useDocumentTitle('Home');
  const { me } = useAuth();
  const { data, error, loading, reload } = useAsync((signal) => dashboardApi.get(signal), []);
  const greeting = me?.first_name ? `Welcome, ${me.first_name}` : 'Welcome';

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={me?.workspace.name}
        actions={
          <Link to="/lineups/new" className="btn btn--primary btn--lg">
            <IconPlus size={20} /> Create lineup
          </Link>
        }
      />

      <ErrorBanner error={error} onRetry={reload} title="Couldn’t load your dashboard" />

      {loading && !data ? (
        <LoadingBlock label="Loading dashboard…" cards={3} />
      ) : data ? (
        <>
          <ul className="stat-row plain-list" aria-label="Totals">
            <li className="stat">
              <Link to="/songs" className="stat__link">
                <span className="stat__num">{data.counts.songs}</span>
                <span className="stat__label">{data.counts.songs === 1 ? 'song' : 'songs'} in the songbook</span>
              </Link>
            </li>
            <li className="stat">
              <Link to="/lineups" className="stat__link">
                <span className="stat__num">{data.counts.lineups}</span>
                <span className="stat__label">saved {data.counts.lineups === 1 ? 'lineup' : 'lineups'}</span>
              </Link>
            </li>
          </ul>

          {data.counts.songs === 0 && (
            <EmptyState
              icon={<IconBook size={36} />}
              title="Add your first song to the songbook"
              action={
                <Link to="/songs?new=1" className="btn btn--primary">
                  <IconPlus size={18} /> Add a song
                </Link>
              }
            >
              <p>Start with the songs your choir sings most. You can attach a PDF, image or chord sheet to each one.</p>
            </EmptyState>
          )}

          {data.recent_lineups.length > 0 && (
            <section className="section" aria-labelledby="recent-lineups-h">
              <div className="section__head">
                <h2 id="recent-lineups-h" className="section__title">
                  Recently used
                </h2>
              </div>
              <div className="card-grid">
                {data.recent_lineups.map((l) => (
                  <LineupCard key={l.id} lineup={l} />
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="saved-lineups-h">
            <div className="section__head">
              <h2 id="saved-lineups-h" className="section__title">
                Saved lineups
              </h2>
              {data.counts.lineups > data.saved_lineups.length && (
                <Link to="/lineups" className="section__more">
                  See all {data.counts.lineups}
                </Link>
              )}
            </div>
            {data.saved_lineups.length === 0 ? (
              <EmptyState
                icon={<IconList size={36} />}
                title="No lineups yet"
                action={
                  <Link to="/lineups/new" className="btn btn--primary">
                    <IconPlus size={18} /> Create lineup
                  </Link>
                }
              >
                <p>Create a reusable lineup like “Sunday Mass — Tagalog” or “Youth Mass — Taglish”, then reuse and tweak it each week.</p>
              </EmptyState>
            ) : (
              <div className="card-grid">
                {data.saved_lineups.map((l) => (
                  <LineupCard key={l.id} lineup={l} />
                ))}
              </div>
            )}
          </section>

          {data.recent_songs.length > 0 && (
            <section className="section" aria-labelledby="recent-songs-h">
              <div className="section__head">
                <h2 id="recent-songs-h" className="section__title">
                  Recently added songs
                </h2>
                <Link to="/songs" className="section__more">
                  Open songbook
                </Link>
              </div>
              <ul className="simple-list">
                {data.recent_songs.map((s) => (
                  <li key={s.id} className="simple-list__item">
                    <div>
                      <span className="simple-list__title">{s.title}</span>
                      <span className="simple-list__meta">
                        {[s.composer, s.language_name, s.key && `Key ${s.key}`].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <span className="simple-list__aside small muted">
                      {s.has_file && (
                        <span className="file-pill file-pill--gap" title="Has attached file">
                          <IconFile size={14} /> <span className="visually-hidden">Has file, </span>
                        </span>
                      )}
                      added {formatRelativeTime(s.created_at)}
                      {s.lineup_count > 0 && ` · in ${pluralize(s.lineup_count, 'lineup')}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}

      <Link to="/lineups/new" className="fab" aria-label="Create lineup">
        <IconPlus size={26} />
      </Link>
    </>
  );
}
