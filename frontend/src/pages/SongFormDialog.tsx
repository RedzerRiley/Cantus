import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Song } from '../api/types';
import { songsApi } from '../api/endpoints';
import { ApiError, errorMessage } from '../api/errors';
import { openSongFile } from '../api/openSongFile';
import { Dialog } from '../components/Dialog';
import { FormErrors, FormField } from '../components/FormField';
import { LanguageSelect } from '../components/LanguageSelect';
import { TagPicker } from '../components/TagPicker';
import { ColorPicker } from '../components/ColorPicker';
import { Button } from '../components/ui';
import { IconFile } from '../components/icons';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { FILE_ACCEPT, MAX_UPLOAD_MB, validateUpload } from '../lib/files';
import { formatFileSize } from '../lib/format';
import { buildSongRequest, emptySongValues, songToValues, validateSongValues, type SongFormValues } from '../lib/songForm';

export interface SongFormDialogProps {
  open: boolean;
  /** Song to edit, or null to create. */
  song: Song | null;
  onClose: () => void;
  onSaved: (song: Song, created: boolean) => void;
}

export function SongFormDialog({ open, song, onClose, onSaved }: SongFormDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={song ? 'Edit song' : 'Add song'} size="md" dismissible={!busy}>
      {open && <SongForm song={song} onCancel={onClose} onSaved={onSaved} onBusyChange={setBusy} />}
    </Dialog>
  );
}

function SongForm({
  song,
  onCancel,
  onSaved,
  onBusyChange,
}: {
  song: Song | null;
  onCancel: () => void;
  onSaved: (song: Song, created: boolean) => void;
  onBusyChange: (b: boolean) => void;
}) {
  const { me } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<SongFormValues>(() => (song ? songToValues(song) : emptySongValues(me?.preferred_language ?? null)));
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const set = <K extends keyof SongFormValues>(k: K, v: SongFormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => errors[k]?.[0];

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const problem = validateUpload(f);
    if (problem) {
      setErrors((prev) => ({ ...prev, file: [problem] }));
      setFile(null);
      e.target.value = '';
      return;
    }
    setErrors(({ file: _ignored, ...rest }) => rest);
    setFile(f);
    setRemoveFile(false);
  };

  const clearPickedFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const local = validateSongValues(values);
    if (Object.keys(local).length) {
      setErrors(Object.fromEntries(Object.entries(local).map(([k, v]) => [k, [v]])));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const req = buildSongRequest(values, file, removeFile);
      let saved: Song;
      if (song) {
        saved = await songsApi.update(song.id, req);
        // Repeated multipart keys can't express "no tags"; clear explicitly with JSON.
        if (req.kind === 'form' && values.tag_ids.length === 0 && saved.tags.length > 0) {
          saved = await songsApi.patch(song.id, { tag_ids: [] });
        }
      } else {
        saved = await songsApi.create(req);
      }
      onSaved(saved, !song);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(error.fieldErrors);
      } else {
        setErrors({ non_field_errors: [errorMessage(error)] });
      }
      setBusy(false);
    }
  };

  const hasExisting = Boolean(song?.has_file);

  return (
    <form onSubmit={onSubmit} noValidate className="form-stack">
      <FormErrors messages={errors.non_field_errors ?? errors.detail} />
      <FormField id="song-title" label="Title" error={err('title')} required>
        {(p) => <input {...p} ref={titleRef} className="input" maxLength={200} value={values.title} onChange={(e) => set('title', e.target.value)} />}
      </FormField>
      <FormField id="song-composer" label="Composer / source" error={err('composer')} hint="e.g. Fr. Manoling Francisco, SJ · Trad. · Bukas Palad">
        {(p) => <input {...p} className="input" maxLength={200} value={values.composer} onChange={(e) => set('composer', e.target.value)} />}
      </FormField>
      <div className="form-grid-2">
        <FormField id="song-language" label="Language" error={err('language')}>
          {(p) => <LanguageSelect {...p} value={values.language} onChange={(v) => set('language', v)} />}
        </FormField>
        <FormField id="song-key" label="Key" error={err('key')} hint="e.g. G, Bb, F#m">
          {(p) => <input {...p} className="input" maxLength={20} autoCapitalize="none" value={values.key} onChange={(e) => set('key', e.target.value)} />}
        </FormField>
      </div>
      <ColorPicker value={values.color} onChange={(c) => set('color', c)} />
      <TagPicker legend="Tags" selected={values.tag_ids} onChange={(ids) => set('tag_ids', ids)} creatable error={err('tag_ids') ?? err('tags')} />
      <FormField id="song-notes" label="Notes" error={err('notes')} hint="Arrangement notes, capo, who leads… (not lyrics)">
        {(p) => <textarea {...p} className="input" rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} />}
      </FormField>

      <fieldset className="file-field" aria-describedby="song-file-hint">
        <legend className="field__label">Music file</legend>
        {hasExisting && !removeFile && !file && song && (
          <div className="file-current">
            <IconFile size={18} />
            <span className="file-current__name">
              {song.file_name} <span className="muted small">{formatFileSize(song.file_size)}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => openSongFile(song.id, song.file_name).catch((e: unknown) => toast.error(errorMessage(e)))}>
              Open
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoveFile(true)}>
              Remove file
            </Button>
          </div>
        )}
        {removeFile && (
          <div className="file-current file-current--removing" role="status">
            <span>The file will be removed when you save.</span>
            <Button size="sm" variant="ghost" onClick={() => setRemoveFile(false)}>
              Undo
            </Button>
          </div>
        )}
        {file && (
          <div className="file-current">
            <IconFile size={18} />
            <span className="file-current__name">
              {file.name} <span className="muted small">{formatFileSize(file.size)}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={clearPickedFile}>
              Don’t upload
            </Button>
          </div>
        )}
        <label htmlFor="song-file" className="btn btn--secondary btn--sm file-pick">
          {hasExisting || file ? 'Choose a different file' : 'Choose file'}
        </label>
        <input
          ref={fileInput}
          id="song-file"
          type="file"
          className="visually-hidden-input"
          accept={FILE_ACCEPT}
          onChange={onFileChange}
          aria-describedby={['song-file-hint', err('file') ? 'song-file-error' : ''].filter(Boolean).join(' ')}
          aria-invalid={err('file') ? true : undefined}
        />
        <p id="song-file-hint" className="field__hint">
          PDF, PNG, JPG, TXT or ChordPro (.cho, .chopro), up to {MAX_UPLOAD_MB} MB. Add only materials your parish has permission to use.
        </p>
        {err('file') && (
          <p id="song-file-error" className="field-error">
            {err('file')}
          </p>
        )}
      </fieldset>

      <div className="dialog__actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? 'Saving…' : song ? 'Save changes' : 'Add song'}
        </Button>
      </div>
    </form>
  );
}
