import { describe, expect, it } from 'vitest';
import { buildSongRequest, emptySongValues, songToValues, validateSongValues, type SongFormValues } from './songForm';
import type { Song } from '../api/types';

const values: SongFormValues = { title: '  Pananagutan ', composer: 'E. P. Hontiveros, SJ', language: 2, key: ' G ', notes: 'Capo 2', tag_ids: [3, 7] };

describe('buildSongRequest', () => {
  it('uses JSON when there is no file change', () => {
    const req = buildSongRequest(values, null, false);
    expect(req.kind).toBe('json');
    if (req.kind !== 'json') return;
    expect(req.body).toEqual({ title: 'Pananagutan', composer: 'E. P. Hontiveros, SJ', language: 2, key: 'G', notes: 'Capo 2', tag_ids: [3, 7] });
  });

  it('uses multipart with repeated tag_ids when a file is attached', () => {
    const file = new File(['%PDF-1.4'], 'pananagutan.pdf', { type: 'application/pdf' });
    const req = buildSongRequest(values, file, false);
    expect(req.kind).toBe('form');
    if (req.kind !== 'form') return;
    expect(req.body.getAll('tag_ids')).toEqual(['3', '7']);
    expect(req.body.get('title')).toBe('Pananagutan');
    expect(req.body.get('language')).toBe('2');
    expect((req.body.get('file') as File).name).toBe('pananagutan.pdf');
    expect(req.body.has('remove_file')).toBe(false);
  });

  it('sends remove_file=true and empty language for null', () => {
    const req = buildSongRequest({ ...values, language: null }, null, true);
    expect(req.kind).toBe('form');
    if (req.kind !== 'form') return;
    expect(req.body.get('remove_file')).toBe('true');
    expect(req.body.get('language')).toBe('');
    expect(req.body.has('file')).toBe(false);
  });
});

describe('validateSongValues', () => {
  it('requires a title and enforces lengths', () => {
    expect(validateSongValues(emptySongValues(null)).title).toMatch(/required/);
    expect(validateSongValues({ ...values, key: 'x'.repeat(21) }).key).toBeTruthy();
    expect(validateSongValues(values)).toEqual({});
  });
});

describe('songToValues', () => {
  it('maps a song to form values', () => {
    const song: Song = {
      id: 1, title: 'T', composer: 'C', language: 1, language_name: 'English', key: 'F', notes: '', color: 'teal',
      tags: [{ id: 9, name: 'Entrance' }], file_name: null, file_size: null, file_type: null, has_file: false,
      lineup_count: 0, created_at: '', updated_at: '',
    };
    expect(songToValues(song)).toEqual({ title: 'T', composer: 'C', language: 1, key: 'F', notes: '', color: 'teal', tag_ids: [9] });
  });

  it('drops unknown colors and sends color in both JSON and multipart', () => {
    const song = { title: 'T', composer: '', language: null, language_name: null, key: '', notes: '', color: 'chartreuse', tags: [] } as unknown as Song;
    expect(songToValues(song).color).toBe('');
    const values = { ...songToValues(song), color: 'blue' as const };
    const json = buildSongRequest(values, null, false);
    expect(json.kind === 'json' && json.body.color).toBe('blue');
    const form = buildSongRequest(values, null, true);
    expect(form.kind === 'form' && form.body.get('color')).toBe('blue');
  });
});
