import { useId, useMemo, useState } from 'react';
import { itemColorStyle } from '../lib/colors';
import type { ID, Song } from '../api/types';
import { songsApi } from '../api/endpoints';
import { useDebounce } from '../hooks/useDebounce';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useCatalog } from '../catalog/CatalogContext';
import { Dialog } from './Dialog';
import { LanguageSelect } from './LanguageSelect';
import { TagPicker } from './TagPicker';
import { Button, ErrorBanner, Spinner } from './ui';
import { IconSearch } from './icons';
import { Link } from '../router';
import { pluralize } from '../lib/format';

export interface SongPickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (songs: Song[]) => void;
  /** Lineup's default language; used as the initial filter. */
  defaultLanguage: ID | null;
  /** Song ids already in the lineup (shown with a hint; can still be added again). */
  existingIds?: ID[];
}

export function SongPicker({ open, onClose, onAdd, defaultLanguage, existingIds = [] }: SongPickerProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Add songs" size="lg">
      {open && <SongPickerBody onClose={onClose} onAdd={onAdd} defaultLanguage={defaultLanguage} existingIds={existingIds} />}
    </Dialog>
  );
}

function SongPickerBody({ onClose, onAdd, defaultLanguage, existingIds }: Omit<SongPickerProps, 'open'> & { existingIds: ID[] }) {
  const { languages } = useCatalog();
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<ID | null>(defaultLanguage);
  const [tags, setTags] = useState<ID[]>([]);
  const [selected, setSelected] = useState<Map<ID, Song>>(new Map());
  const debounced = useDebounce(search, 300);
  const searchId = useId();
  const langId = useId();

  const key = JSON.stringify({ debounced, language, tags });
  const list = usePaginatedList<Song>(
    (page, signal) => songsApi.list({ search: debounced, language: language ?? undefined, tags, page, page_size: 30 }, signal),
    key,
  );

  const existing = useMemo(() => new Set(existingIds), [existingIds]);
  const defaultLangName = languages.find((l) => l.id === defaultLanguage)?.name;

  const toggle = (song: Song) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(song.id)) next.delete(song.id);
      else next.set(song.id, song);
      return next;
    });
  };

  const confirm = () => {
    onAdd([...selected.values()]);
    onClose();
  };

  return (
    <div className="song-picker">
      <div className="song-picker__filters">
        <div className="field">
          <label htmlFor={searchId} className="field__label">
            Search songs
          </label>
          <div className="input-icon">
            <IconSearch />
            <input id={searchId} type="search" className="input" placeholder="Title or composer" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <div className="field">
          <label htmlFor={langId} className="field__label">
            Language
          </label>
          <LanguageSelect id={langId} value={language} onChange={setLanguage} emptyLabel="All languages" />
        </div>
      </div>
      {defaultLanguage !== null && language === defaultLanguage && defaultLangName && (
        <p className="small muted">
          Showing {defaultLangName} songs (the lineup’s language).{' '}
          <button type="button" className="link-btn" onClick={() => setLanguage(null)}>
            Show all languages
          </button>
        </p>
      )}
      <details className="disclosure">
        <summary>Filter by tag{tags.length ? ` (${tags.length})` : ''}</summary>
        <TagPicker legend="Tags" hideLegend selected={tags} onChange={setTags} />
      </details>

      <ErrorBanner error={list.error} onRetry={list.reload} />
      {list.loading ? (
        <Spinner label="Loading songs…" />
      ) : list.items.length === 0 && !list.error ? (
        <div className="empty-inline">
          <p>No songs match.</p>
          <p className="small muted">
            Try clearing filters, or <Link to="/songs?new=1">add a song to the songbook</Link>.
          </p>
        </div>
      ) : (
        <>
          <p className="small muted" aria-live="polite">
            {pluralize(list.count, 'song')} found
          </p>
          <ul className="pick-list">
            {list.items.map((song) => {
              const id = `pick-${song.id}`;
              const checked = selected.has(song.id);
              return (
                <li key={song.id} className={`pick-list__item${checked ? ' is-checked' : ''}`} style={itemColorStyle(song.color)}>
                  <input type="checkbox" id={id} checked={checked} onChange={() => toggle(song)} />
                  <label htmlFor={id}>
                    <span className="pick-list__title">{song.title}</span>
                    <span className="pick-list__meta">
                      {[song.composer, song.language_name, song.key && `Key ${song.key}`].filter(Boolean).join(' · ')}
                      {existing.has(song.id) && <span className="badge">In lineup</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {list.hasMore && (
            <div className="center">
              <Button onClick={list.loadMore} busy={list.loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <div className="song-picker__footer">
        <span className="small" aria-live="polite">
          {selected.size ? `${pluralize(selected.size, 'song')} selected` : 'Select songs to add'}
        </span>
        <div className="btn-row">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={selected.size === 0}>
            {selected.size ? `Add ${pluralize(selected.size, 'song')}` : 'Add songs'}
          </Button>
        </div>
      </div>
    </div>
  );
}
