import { useState } from 'react';
import type { ID, LineupQuery, LineupSummary } from '../api/types';
import { lineupsApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useDebounce } from '../hooks/useDebounce';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Link, useNavigate } from '../router';
import { Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { LanguageSelect } from '../components/LanguageSelect';
import { TagPicker } from '../components/TagPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LineupCard } from '../components/LineupCard';
import { useToast } from '../components/Toast';
import { IconCopy, IconList, IconPlus, IconSearch, IconTrash } from '../components/icons';
import { pluralize } from '../lib/format';

type Ordering = NonNullable<LineupQuery['ordering']>;
const SORTS: { value: Ordering; label: string }[] = [
  { value: '-updated_at', label: 'Recently edited' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-last_used_at', label: 'Recently used' },
];

export function LineupsPage() {
  useDocumentTitle('Lineups');
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<ID | null>(null);
  const [tags, setTags] = useState<ID[]>([]);
  const [ordering, setOrdering] = useState<Ordering>('-updated_at');
  const [deleting, setDeleting] = useState<LineupSummary | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<ID | null>(null);
  const debounced = useDebounce(search, 300);

  const key = JSON.stringify({ debounced, language, tags, ordering });
  const list = usePaginatedList<LineupSummary>(
    (page, signal) => lineupsApi.list({ search: debounced, language: language ?? undefined, tags, ordering, page }, signal),
    key,
  );
  const filtersActive = Boolean(search.trim()) || language !== null || tags.length > 0;

  const clearFilters = () => {
    setSearch('');
    setLanguage(null);
    setTags([]);
  };

  const duplicate = async (l: LineupSummary) => {
    setDuplicatingId(l.id);
    try {
      const copy = await lineupsApi.duplicate(l.id);
      toast.success('Duplicated — the original is unchanged');
      navigate(`/lineups/${copy.id}`, { state: { lineup: copy, skipUse: true } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDuplicatingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    await lineupsApi.remove(target.id);
    list.setItems((items) => items.filter((x) => x.id !== target.id));
    list.setCount((c) => Math.max(0, c - 1));
    setDeleting(null);
    toast.success(`“${target.name}” deleted`);
  };

  return (
    <>
      <PageHeader
        title="Lineups"
        subtitle={list.loading && !list.items.length ? undefined : pluralize(list.count, 'lineup')}
        actions={
          <Link to="/lineups/new" className="btn btn--primary hide-mobile">
            <IconPlus size={18} /> New lineup
          </Link>
        }
      />

      <section className="filters" aria-label="Search, filter and sort lineups">
        <div className="filters__row">
          <div className="field filters__search">
            <label htmlFor="lineup-search" className="field__label">
              Search
            </label>
            <div className="input-icon">
              <IconSearch />
              <input id="lineup-search" type="search" className="input" placeholder="Name or description" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lineup-lang" className="field__label">
              Language
            </label>
            <LanguageSelect id="lineup-lang" value={language} onChange={setLanguage} emptyLabel="All languages" />
          </div>
          <div className="field">
            <label htmlFor="lineup-sort" className="field__label">
              Sort by
            </label>
            <select id="lineup-sort" className="input" value={ordering} onChange={(e) => setOrdering(e.target.value as Ordering)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <Button variant="ghost" onClick={clearFilters} className="filters__clear">
              Clear filters
            </Button>
          )}
        </div>
        <details className="disclosure" open={tags.length > 0 || undefined}>
          <summary>Filter by tag{tags.length ? ` (${tags.length} selected)` : ''}</summary>
          <TagPicker legend="Tags (lineups must have all selected tags)" selected={tags} onChange={setTags} />
        </details>
        {ordering === '-last_used_at' && <p className="small muted">Showing only lineups that have been opened at least once.</p>}
      </section>

      <ErrorBanner error={list.error} onRetry={list.reload} title="Couldn’t load lineups" />

      {list.loading ? (
        <LoadingBlock label="Loading lineups…" cards={6} />
      ) : list.items.length === 0 && !list.error ? (
        filtersActive || ordering === '-last_used_at' ? (
          <EmptyState icon={<IconSearch size={32} />} title="No lineups match" action={<Button onClick={() => { clearFilters(); setOrdering('-updated_at'); }}>Show all lineups</Button>} />
        ) : (
          <EmptyState
            icon={<IconList size={36} />}
            title="No lineups yet"
            action={
              <Link to="/lineups/new" className="btn btn--primary">
                <IconPlus size={18} /> Create lineup
              </Link>
            }
          >
            <p>A lineup is a reusable, ordered set of songs — for example “Sunday Mass — Tagalog” or “Simbang Gabi — English”.</p>
          </EmptyState>
        )
      ) : (
        <>
          <ul className="card-grid plain-list" aria-label="Lineups">
            {list.items.map((l) => (
              <li key={l.id}>
                <LineupCard
                  lineup={l}
                  actions={
                    <>
                      <Link to={`/lineups/${l.id}`} className="btn btn--secondary btn--sm" aria-label={`Open “${l.name}”`}>
                        Open
                      </Link>
                      <Button size="sm" icon={<IconCopy size={16} />} busy={duplicatingId === l.id} onClick={() => void duplicate(l)} aria-label={`Duplicate “${l.name}”`}>
                        Duplicate
                      </Button>
                      <Button size="sm" variant="ghost" icon={<IconTrash size={16} />} onClick={() => setDeleting(l)} aria-label={`Delete “${l.name}”`}>
                        Delete
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
          {list.hasMore && (
            <div className="center load-more">
              <Button onClick={list.loadMore} busy={list.loadingMore}>
                Load more lineups
              </Button>
            </div>
          )}
        </>
      )}

      <Link to="/lineups/new" className="fab" aria-label="New lineup">
        <IconPlus size={26} />
      </Link>

      <ConfirmDialog open={deleting !== null} title="Delete lineup?" confirmLabel="Delete lineup" danger onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
        {deleting && (
          <p>
            “{deleting.name}” will be permanently deleted. The songs stay in your songbook.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
