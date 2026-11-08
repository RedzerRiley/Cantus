import { useEffect, useState } from 'react';
import type { ID, Song } from '../api/types';
import { songsApi } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { openSongFile } from '../api/openSongFile';
import { useDebounce } from '../hooks/useDebounce';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCatalog } from '../catalog/CatalogContext';
import { useNavigate, useSearchParams } from '../router';
import { Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { LanguageSelect } from '../components/LanguageSelect';
import { TagPicker } from '../components/TagPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { IconBook, IconEdit, IconExternal, IconFile, IconPlus, IconSearch, IconTrash } from '../components/icons';
import { formatFileSize, pluralize } from '../lib/format';
import { SongFormDialog } from './SongFormDialog';
import { itemColorStyle } from '../lib/colors';

export function SongbookPage() {
  useDocumentTitle('Songbook');
  const toast = useToast();
  const navigate = useNavigate();
  const params = useSearchParams();
  const catalog = useCatalog();
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<ID | null>(null);
  const [tags, setTags] = useState<ID[]>([]);
  const debounced = useDebounce(search, 300);

  const [editing, setEditing] = useState<Song | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Song | null>(null);

  const key = JSON.stringify({ debounced, language, tags });
  const list = usePaginatedList<Song>(
    (page, signal) => songsApi.list({ search: debounced, language: language ?? undefined, tags, page }, signal),
    key,
  );
  const filtersActive = Boolean(search.trim()) || language !== null || tags.length > 0;

  // /songs?new=1 opens the add dialog (used by empty states elsewhere).
  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null);
      setFormOpen(true);
      navigate('/songs', { replace: true, force: true });
    }
  }, [params, navigate]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (song: Song) => {
    setEditing(song);
    setFormOpen(true);
  };
  const clearFilters = () => {
    setSearch('');
    setLanguage(null);
    setTags([]);
  };

  const onSaved = (song: Song, created: boolean) => {
    setFormOpen(false);
    if (created) {
      list.reload();
      toast.success(`“${song.title}” added to the songbook`);
    } else {
      list.setItems((items) => items.map((s) => (s.id === song.id ? song : s)));
      toast.success('Song saved');
    }
    catalog.reload(); // song counts per language/tag changed
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await songsApi.remove(deleting.id);
    const title = deleting.title;
    list.setItems((items) => items.filter((s) => s.id !== deleting.id));
    list.setCount((c) => Math.max(0, c - 1));
    setDeleting(null);
    catalog.reload();
    toast.success(`“${title}” deleted`);
  };

  const openFile = (song: Song) => {
    openSongFile(song.id, song.file_name).catch((err: unknown) => toast.error(errorMessage(err)));
  };

  return (
    <>
      <PageHeader
        title="Songbook"
        subtitle={list.loading && !list.items.length ? undefined : pluralize(list.count, 'song')}
        actions={
          <Button variant="primary" icon={<IconPlus size={18} />} onClick={openNew} className="hide-mobile">
            Add song
          </Button>
        }
      />

      <section className="filters" aria-label="Search and filter songs">
        <div className="filters__row">
          <div className="field filters__search">
            <label htmlFor="song-search" className="field__label">
              Search
            </label>
            <div className="input-icon">
              <IconSearch />
              <input id="song-search" type="search" className="input" placeholder="Title or composer" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="song-lang-filter" className="field__label">
              Language
            </label>
            <LanguageSelect id="song-lang-filter" value={language} onChange={setLanguage} emptyLabel="All languages" />
          </div>
          {filtersActive && (
            <Button variant="ghost" onClick={clearFilters} className="filters__clear">
              Clear filters
            </Button>
          )}
        </div>
        <details className="disclosure" open={tags.length > 0 || undefined}>
          <summary>Filter by tag{tags.length ? ` (${tags.length} selected)` : ''}</summary>
          <TagPicker legend="Tags (songs must have all selected tags)" selected={tags} onChange={setTags} />
        </details>
      </section>

      <p className="permission-note small">Add only materials your parish has permission to use. Cantus stores song details and files — not lyrics.</p>

      <ErrorBanner error={list.error} onRetry={list.reload} title="Couldn’t load songs" />

      {list.loading ? (
        <LoadingBlock label="Loading songs…" cards={6} />
      ) : list.items.length === 0 && !list.error ? (
        filtersActive ? (
          <EmptyState icon={<IconSearch size={32} />} title="No songs match" action={<Button onClick={clearFilters}>Clear filters</Button>}>
            <p>Try a different spelling, or search by composer.</p>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<IconBook size={36} />}
            title="Your songbook is empty"
            action={
              <Button variant="primary" icon={<IconPlus size={18} />} onClick={openNew}>
                Add your first song
              </Button>
            }
          >
            <p>Add the songs your choir sings — title, composer, language, key and tags — and attach a PDF, image (PNG or JPG) or chord sheet if you have one.</p>
          </EmptyState>
        )
      ) : (
        <>
          <ul className="card-grid plain-list" aria-label="Songs">
            {list.items.map((song) => (
              <li key={song.id}>
                <SongCard song={song} onEdit={() => openEdit(song)} onDelete={() => setDeleting(song)} onOpenFile={() => openFile(song)} />
              </li>
            ))}
          </ul>
          {list.hasMore && (
            <div className="center load-more">
              <Button onClick={list.loadMore} busy={list.loadingMore}>
                Load more songs
              </Button>
              <p className="small muted">
                Showing {list.items.length} of {list.count}
              </p>
            </div>
          )}
        </>
      )}

      <button type="button" className="fab" onClick={openNew} aria-label="Add song">
        <IconPlus size={26} />
      </button>

      <SongFormDialog open={formOpen} song={editing} onClose={() => setFormOpen(false)} onSaved={onSaved} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete song?"
        confirmLabel="Delete song"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (
          <>
            <p>
              “{deleting.title}” will be permanently deleted{deleting.has_file ? ', along with its attached file' : ''}.
            </p>
            {deleting.lineup_count > 0 && (
              <p className="warning-text">
                It’s used in {pluralize(deleting.lineup_count, 'lineup')}; it will be removed from {deleting.lineup_count === 1 ? 'it' : 'them'}.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function SongCard({ song, onEdit, onDelete, onOpenFile }: { song: Song; onEdit: () => void; onDelete: () => void; onOpenFile: () => void }) {
  return (
    <article className="card song-card" style={itemColorStyle(song.color)}>
      <h2 className="card__title card__title--song">{song.title}</h2>
      <p className="card__meta">{[song.composer, song.language_name, song.key && `Key ${song.key}`].filter(Boolean).join(' · ') || '—'}</p>
      {song.tags.length > 0 && (
        <ul className="tag-list" aria-label="Tags">
          {song.tags.map((t) => (
            <li key={t.id} className="tag">
              {t.name}
            </li>
          ))}
        </ul>
      )}
      {song.notes && <p className="card__notes small">{song.notes}</p>}
      <p className="card__foot small muted">
        {song.has_file ? (
          <span className="file-pill">
            <IconFile size={14} /> {song.file_type?.toUpperCase()} · {formatFileSize(song.file_size)}
          </span>
        ) : (
          'No file'
        )}
        {song.lineup_count > 0 && <> · in {pluralize(song.lineup_count, 'lineup')}</>}
      </p>
      <div className="card__actions">
        {song.has_file && (
          <Button size="sm" icon={<IconExternal size={16} />} onClick={onOpenFile} aria-label={`Open file for “${song.title}”`}>
            Open file
          </Button>
        )}
        <Button size="sm" icon={<IconEdit size={16} />} onClick={onEdit} aria-label={`Edit “${song.title}”`}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon={<IconTrash size={16} />} onClick={onDelete} aria-label={`Delete “${song.title}”`}>
          Delete
        </Button>
      </div>
    </article>
  );
}
