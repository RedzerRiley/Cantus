import type { ID, Song } from '../api/types';
import { isItemColor, type ItemColor } from './colors';

export interface SongFormValues {
  title: string;
  composer: string;
  language: ID | null;
  key: string;
  notes: string;
  color: ItemColor;
  tag_ids: ID[];
}

export function emptySongValues(defaultLanguage: ID | null): SongFormValues {
  return { title: '', composer: '', language: defaultLanguage, key: '', notes: '', color: '', tag_ids: [] };
}

export function songToValues(song: Song): SongFormValues {
  return {
    title: song.title,
    composer: song.composer ?? '',
    language: song.language,
    key: song.key ?? '',
    notes: song.notes ?? '',
    color: isItemColor(song.color) ? song.color : '',
    tag_ids: song.tags.map((t) => t.id),
  };
}

/** Client-side checks mirroring the contract's limits. */
export function validateSongValues(v: SongFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) errors.title = 'Title is required.';
  else if (v.title.trim().length > 200) errors.title = 'Keep the title to 200 characters or fewer.';
  if (v.composer.trim().length > 200) errors.composer = 'Keep the composer to 200 characters or fewer.';
  if (v.key.trim().length > 20) errors.key = 'Keep the key to 20 characters or fewer (e.g. “G”, “Bb”, “F#m”).';
  return errors;
}

export interface SongJsonPayload {
  title: string;
  composer: string;
  language: ID | null;
  key: string;
  notes: string;
  color: ItemColor;
  tag_ids: ID[];
}

export type SongRequestBody = { kind: 'json'; body: SongJsonPayload } | { kind: 'form'; body: FormData };

/**
 * Build the request body for create/update.
 * JSON unless a new file is attached or the existing file is being removed,
 * in which case multipart is used with `tag_ids` sent as repeated keys and
 * a null language sent as '' (DRF relational fields treat '' as null).
 */
export function buildSongRequest(values: SongFormValues, file: File | null, removeFile: boolean): SongRequestBody {
  const json: SongJsonPayload = {
    title: values.title.trim(),
    composer: values.composer.trim(),
    language: values.language,
    key: values.key.trim(),
    notes: values.notes,
    color: values.color,
    tag_ids: values.tag_ids,
  };
  if (!file && !removeFile) return { kind: 'json', body: json };

  const fd = new FormData();
  fd.append('title', json.title);
  fd.append('composer', json.composer);
  fd.append('language', json.language === null ? '' : String(json.language));
  fd.append('key', json.key);
  fd.append('notes', json.notes);
  fd.append('color', json.color);
  for (const id of json.tag_ids) fd.append('tag_ids', String(id));
  if (file) fd.append('file', file, file.name);
  else if (removeFile) fd.append('remove_file', 'true');
  return { kind: 'form', body: fd };
}
