import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react';
import type { ID, Lineup, Song } from '../api/types';
import { lineupsApi } from '../api/endpoints';
import { ApiError, errorMessage } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { Link, useBlocker, useLocation, useNavigate } from '../router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { FormErrors, FormField } from '../components/FormField';
import { LanguageSelect } from '../components/LanguageSelect';
import { TagPicker } from '../components/TagPicker';
import { ColorPicker } from '../components/ColorPicker';
import { SongPicker } from '../components/SongPicker';
import { MusicStand } from '../components/MusicStand';
import { ShareLineupDialog } from '../components/ShareLineupDialog';
import { LineupItemList } from '../components/LineupItemList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Menu } from '../components/Menu';
import { useToast } from '../components/Toast';
import { IconArrowLeft, IconCopy, IconEdit, IconEye, IconLink, IconList, IconPlus, IconSave, IconSort, IconTrash } from '../components/icons';
import { formatRelativeTime, pluralize } from '../lib/format';
import {
  draftFromLineup,
  draftItemFromSong,
  draftSignature,
  emptyDraft,
  hasSortableParts,
  rebaseDraft,
  sortItemsByPart,
  toLineupWrite,
  validateDraft,
  type LineupDraft,
} from '../lib/lineupDraft';

interface NavState {
  lineup?: Lineup;
  /** Don't mark as used (just created/duplicated rather than opened). */
  skipUse?: boolean;
}

export function LineupEditorPage({ lineupId }: { lineupId: ID | null }) {
  const { me } = useAuth();
  const location = useLocation();
  const navState = (location.state ?? {}) as NavState;
  const prefetched = navState.lineup && navState.lineup.id === lineupId ? navState.lineup : null;

  const [lineup, setLineup] = useState<Lineup | null>(prefetched);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(lineupId !== null && !prefetched);
  const [reloadTick, setReloadTick] = useState(0);
  const usedRef = useRef(false);

  // Navigation state lives in history.state and survives reloads / back-forward.
  // Consume it once so a reload re-fetches the lineup (instead of showing the
  // stale pre-save snapshot) and counts as opening it (use/).
  useEffect(() => {
    if (!navState.lineup && !navState.skipUse) return;
    try {
      const hs = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.replaceState({ ...hs, usr: null }, '');
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lineupId === null || (prefetched && reloadTick === 0)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    lineupsApi
      .get(lineupId, controller.signal)
      .then((l) => setLineup(l))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupId, reloadTick]);

  // Mark as used once per open (ref survives StrictMode's double effect).
  useEffect(() => {
    if (lineupId === null || usedRef.current || navState.skipUse) return;
    usedRef.current = true;
    lineupsApi.markUsed(lineupId).catch(() => {
      /* non-critical */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupId]);

  if (lineupId !== null && loading && !lineup) {
    return (
      <>
        <PageHeader title="Loading lineup…" />
        <LoadingBlock label="Loading lineup…" lines={6} />
      </>
    );
  }

  if (lineupId !== null && !lineup) {
    const notFound = loadError instanceof ApiError && loadError.status === 404;
    return (
      <>
        <PageHeader title={notFound ? 'Lineup not found' : 'Couldn’t open lineup'} back={<BackLink />} />
        {notFound ? (
          <EmptyState icon={<IconList size={36} />} title="This lineup doesn’t exist" action={<Link to="/lineups" className="btn btn--primary">See all lineups</Link>}>
            <p>It may have been deleted by someone in your group.</p>
          </EmptyState>
        ) : (
          <ErrorBanner error={loadError} onRetry={() => setReloadTick((t) => t + 1)} />
        )}
      </>
    );
  }

  return (
    <Editor
      key={lineup?.id ?? 'new'}
      initial={lineup}
      defaultLanguage={me?.preferred_language ?? null}
      // Just created or duplicated → the user is mid-edit, so keep the editor.
      startInEditor={Boolean(navState.skipUse)}
    />
  );
}

function BackLink() {
  return (
    <Link to="/lineups" className="back-link">
      <IconArrowLeft size={18} /> Lineups
    </Link>
  );
}

function Editor({
  initial,
  defaultLanguage,
  startInEditor = false,
}: {
  initial: Lineup | null;
  defaultLanguage: ID | null;
  startInEditor?: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = initial === null;
  const [meta, setMeta] = useState<Lineup | null>(initial);
  const [draft, setDraft] = useState<LineupDraft>(() => (initial ? draftFromLineup(initial) : emptyDraft(defaultLanguage)));
  const [savedSig, setSavedSig] = useState(() => draftSignature(initial ? draftFromLineup(initial) : emptyDraft(defaultLanguage)));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Re-sort by Part whenever a Part is edited (on by default; remembered per browser).
  const [autoSort, setAutoSort] = useState(() => {
    try {
      return window.localStorage.getItem('cantus.autoSortParts') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleAutoSort = (on: boolean) => {
    setAutoSort(on);
    try {
      window.localStorage.setItem('cantus.autoSortParts', on ? 'on' : 'off');
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
    if (on) sortByPart(true);
  };
  const [shareToken, setShareToken] = useState<string | null>(initial?.share_token ?? null);
  // Saved lineups with songs open in music stand view; new/empty ones need editing first.
  const [mode, setMode] = useState<'edit' | 'view'>(() =>
    !startInEditor && initial !== null && initial.items.length > 0 ? 'view' : 'edit',
  );
  const [announcement, setAnnouncement] = useState('');
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // On phones, saved lineups open with details collapsed so the songs are visible first.
  const [detailsOpen, setDetailsOpen] = useState(
    () => isNew || typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 640px)').matches,
  );

  const dirty = useMemo(() => draftSignature(draft) !== savedSig, [draft, savedSig]);
  useBlocker(dirty && !saving, 'You have unsaved changes to this lineup. Leave without saving?');
  useDocumentTitle(draft.name.trim() || (isNew ? 'New lineup' : 'Lineup'));

  const announce = useCallback((msg: string) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(msg), 30);
  }, []);

  useEffect(() => {
    if (isNew) nameRef.current?.focus();
  }, [isNew]);

  const setField = <K extends keyof LineupDraft>(k: K, v: LineupDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Put the songs in the order of the Mass according to each song's Part.
  const sortByPart = (quiet = false) => {
    const sorted = sortItemsByPart(draft.items);
    if (sorted.every((it, i) => it === draft.items[i])) {
      if (!quiet) announce('Songs are already in the order of the Mass.');
      return;
    }
    setField('items', sorted);
    announce('Songs sorted into the order of the Mass.');
  };
  const sortableParts = hasSortableParts(draft.items);

  const save = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (saving) return;
      const local = validateDraft(draft);
      setErrors(local);
      setServerErrors({});
      if (Object.keys(local).length) {
        if (local.name) {
          setDetailsOpen(true);
          window.setTimeout(() => nameRef.current?.focus(), 0);
        }
        announce('Please fix the highlighted fields before saving.');
        return;
      }
      setSaving(true);
      try {
        const body = toLineupWrite(draft);
        if (isNew || !meta) {
          const created = await lineupsApi.create(body);
          setSavedSig(draftSignature(draftFromLineup(created)));
          toast.success('Lineup created');
          navigate(`/lineups/${created.id}`, { replace: true, force: true, state: { lineup: created, skipUse: true } satisfies NavState });
          return;
        }
        const saved = await lineupsApi.replace(meta.id, body);
        const rebased = rebaseDraft(draft, saved);
        setMeta(saved);
        setDraft(rebased);
        setSavedSig(draftSignature(rebased));
        toast.success('Lineup saved');
      } catch (err) {
        if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
          setServerErrors(err.fieldErrors);
          if (['name', 'description', 'default_language', 'tag_ids'].some((k) => k in err.fieldErrors)) setDetailsOpen(true);
          toast.error(err.message);
        } else {
          toast.error(errorMessage(err));
        }
      } finally {
        setSaving(false);
      }
    },
    [saving, draft, isNew, meta, navigate, toast, announce],
  );

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const addSongs = (songs: Song[]) => {
    if (!songs.length) return;
    setDraft((d) => ({ ...d, items: [...d.items, ...songs.map(draftItemFromSong)] }));
    announce(`Added ${pluralize(songs.length, 'song')} to the end of the lineup.`);
    toast.success(`Added ${pluralize(songs.length, 'song')}`);
  };

  const duplicate = async () => {
    if (!meta) return;
    setDuplicating(true);
    try {
      const copy = await lineupsApi.duplicate(meta.id);
      toast.success('Duplicated — the original is unchanged');
      navigate(`/lineups/${copy.id}`, { state: { lineup: copy, skipUse: true } satisfies NavState });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDuplicating(false);
    }
  };

  const doDelete = async () => {
    if (!meta) return;
    await lineupsApi.remove(meta.id);
    setConfirmDelete(false);
    toast.success(`“${meta.name}” deleted`);
    navigate('/lineups', { replace: true, force: true });
  };

  const fieldErr = (k: string) => errors[k] ?? serverErrors[k]?.[0];
  const itemServerErrors = serverErrors.items;
  const otherServerErrors = Object.entries(serverErrors)
    .filter(([k]) => !['name', 'description', 'default_language', 'tag_ids', 'items'].includes(k))
    .flatMap(([, v]) => v);

  const title = draft.name.trim() || (isNew ? 'New lineup' : 'Untitled lineup');

  return (
    <div className={`editor${mode === 'view' ? ' editor--view' : ''}`}>
      <PageHeader
        back={<BackLink />}
        title={title}
        subtitle={
          <span className="editor__status" role="status">
            {dirty ? (
              <span className="status-pill status-pill--dirty">Unsaved changes</span>
            ) : isNew ? (
              'Not saved yet'
            ) : (
              <>
                <span className="status-pill">Saved</span> {meta && `· edited ${formatRelativeTime(meta.updated_at)}`}
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button icon={mode === 'edit' ? <IconEye size={18} /> : <IconEdit size={18} />} onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))} aria-pressed={mode === 'view'}>
              {mode === 'edit' ? 'Music stand view' : 'Back to editing'}
            </Button>
            {!isNew && meta && (
              <Button icon={<IconLink size={18} />} onClick={() => setShareOpen(true)} aria-label={shareToken ? 'Share link (on)' : 'Share link'}>
                {shareToken ? 'Shared' : 'Share'}
              </Button>
            )}
            {!isNew && (
              <Menu
                label="More lineup actions"
                buttonClassName="icon-btn icon-btn--bordered"
                items={[
                  { label: duplicating ? 'Duplicating…' : dirty ? 'Duplicate (save first)' : 'Duplicate', icon: <IconCopy size={18} />, disabled: dirty || duplicating, onSelect: () => void duplicate() },
                  { label: 'Delete lineup', icon: <IconTrash size={18} />, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
            )}
          </>
        }
      />

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {mode === 'view' ? (
        <MusicStandView draft={draft} />
      ) : (
        <form id="lineup-form" onSubmit={save} noValidate>
          <FormErrors messages={otherServerErrors} />
          <details
            className="card editor__details"
            open={detailsOpen}
            onToggle={(e: SyntheticEvent<HTMLDetailsElement>) => setDetailsOpen(e.currentTarget.open)}
          >
            <summary className="editor__details-summary">
              <h2 className="section__title">Details</h2>
              {!detailsOpen && (
                <span className="small muted editor__details-brief">
                  {[draft.default_language !== null ? 'Language set' : 'No language', pluralize(draft.tag_ids.length, 'tag')].join(' · ')}
                </span>
              )}
            </summary>
            <div className="form-grid-2">
              <FormField id="lineup-name" label="Name" error={fieldErr('name')} required>
                {(p) => (
                  <input {...p} ref={nameRef} className="input" maxLength={200} placeholder="e.g. Sunday Mass — Tagalog" value={draft.name} onChange={(e) => setField('name', e.target.value)} />
                )}
              </FormField>
              <FormField id="lineup-language" label="Default language" error={fieldErr('default_language')} hint="Used to pre-filter songs when adding.">
                {(p) => <LanguageSelect {...p} value={draft.default_language} onChange={(v) => setField('default_language', v)} />}
              </FormField>
            </div>
            <FormField id="lineup-desc" label="Description" error={fieldErr('description')}>
              {(p) => <textarea {...p} className="input" rows={2} placeholder="When or how this lineup is used (optional)" value={draft.description} onChange={(e) => setField('description', e.target.value)} />}
            </FormField>
            <ColorPicker value={draft.color} onChange={(c) => setField('color', c)} />
            <TagPicker legend="Tags" selected={draft.tag_ids} onChange={(ids) => setField('tag_ids', ids)} creatable error={fieldErr('tag_ids')} />
          </details>

          <section className="section editor__songs" aria-labelledby="songs-h">
            <div className="section__head">
              <h2 id="songs-h" className="section__title">
                Songs <span className="muted">({draft.items.length})</span>
              </h2>
              <Button ref={addButtonRef} icon={<IconPlus size={18} />} onClick={() => setPickerOpen(true)} className="hide-mobile">
                Add songs
              </Button>
            </div>
            {draft.items.length > 1 && (
              <div className="sort-controls">
                <Button
                  size="sm"
                  icon={<IconSort size={16} />}
                  onClick={() => sortByPart()}
                  disabled={!sortableParts}
                  title={sortableParts ? 'Order the songs by their Part: Entrance, Gloria … Recessional' : 'Give at least two songs a Part (Entrance, Gloria, …) to sort them'}
                >
                  Sort by part
                </Button>
                <label className="sort-controls__auto small">
                  <input type="checkbox" checked={autoSort} onChange={(e) => toggleAutoSort(e.target.checked)} />
                  Auto-sort when a part is set
                </label>
              </div>
            )}
            <FormErrors messages={itemServerErrors} />
            {draft.items.length === 0 ? (
              <EmptyState
                icon={<IconList size={32} />}
                title="No songs in this lineup yet"
                action={
                  <Button variant="primary" icon={<IconPlus size={18} />} onClick={() => setPickerOpen(true)}>
                    Add songs
                  </Button>
                }
              >
                <p>Pick songs from your songbook. You can label each one (Entrance, Gloria, Communion…), and change the key.</p>
              </EmptyState>
            ) : (
              <LineupItemList items={draft.items} onChange={(items) => setField('items', items)} announce={announce} errors={errors} onEmptied={() => addButtonRef.current?.focus()} onPartCommit={autoSort ? () => sortByPart(true) : undefined} />
            )}
          </section>
        </form>
      )}

      <div className="action-bar" role="region" aria-label="Lineup actions">
        <span className="action-bar__status small">{dirty ? 'Unsaved changes' : isNew ? 'Not saved yet' : 'All changes saved'}</span>
        <div className="action-bar__buttons">
          {mode === 'edit' && (
            <Button icon={<IconPlus size={18} />} onClick={() => setPickerOpen(true)}>
              Add songs
            </Button>
          )}
          <Button variant="primary" icon={<IconSave size={18} />} onClick={() => void save()} busy={saving} disabled={!dirty && !isNew}>
            {saving ? 'Saving…' : isNew ? 'Save lineup' : 'Save'}
          </Button>
        </div>
      </div>

      <SongPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={addSongs}
        defaultLanguage={draft.default_language}
        existingIds={draft.items.map((i) => i.song)}
      />

      {meta && (
        <ShareLineupDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          lineupId={meta.id}
          lineupName={meta.name}
          token={shareToken}
          onTokenChange={setShareToken}
        />
      )}

      <ConfirmDialog open={confirmDelete} title="Delete lineup?" confirmLabel="Delete lineup" danger onConfirm={doDelete} onCancel={() => setConfirmDelete(false)}>
        <p>“{meta?.name}” will be permanently deleted. The songs stay in your songbook.</p>
      </ConfirmDialog>
    </div>
  );
}

function MusicStandView({ draft }: { draft: LineupDraft }) {
  return (
    <MusicStand
      items={draft.items.map((it) => ({
        key: it.uid,
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
  );
}
