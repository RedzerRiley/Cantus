import { describe, expect, it } from 'vitest';
import type { Lineup } from '../api/types';
import { draftFromLineup, draftSignature, emptyDraft, rebaseDraft, toLineupWrite, validateDraft } from './lineupDraft';
import { moveUp } from './reorder';

const brief = (id: number, title: string) => ({ id, title, composer: '', key: 'C', language_name: 'Tagalog', has_file: false });

const lineup: Lineup = {
  id: 3,
  name: 'Sunday Mass — Tagalog',
  description: '',
  default_language: 2,
  default_language_name: 'Tagalog',
  tags: [{ id: 5, name: 'Ordinary Time' }, { id: 1, name: 'Entrance' }],
  items: [
    { id: 12, position: 1, song: 8, song_detail: brief(8, 'Papuri sa Diyos'), label: 'Gloria', key: '', notes: '', assigned_to: '' },
    { id: 11, position: 0, song: 7, song_detail: brief(7, 'Pananagutan'), label: 'Entrance', key: 'G', notes: 'Capo 2', assigned_to: 'Ben (guitar)' },
  ],
  item_count: 2,
  created_at: '',
  updated_at: '',
  last_used_at: null,
};

describe('lineup drafts', () => {
  it('orders items by position and builds the write payload', () => {
    const draft = draftFromLineup(lineup);
    expect(draft.items.map((i) => i.song)).toEqual([7, 8]);
    expect(toLineupWrite(draft)).toEqual({
      name: 'Sunday Mass — Tagalog',
      description: '',
      default_language: 2,
      color: '',
      tag_ids: [5, 1],
      items: [
        { song: 7, label: 'Entrance', key: 'G', notes: 'Capo 2', assigned_to: 'Ben (guitar)' },
        { song: 8, label: 'Gloria', key: '', notes: '', assigned_to: '' },
      ],
    });
  });

  it('gives each item a unique uid even for repeated songs', () => {
    const draft = draftFromLineup({ ...lineup, items: [lineup.items[1]!, { ...lineup.items[1]!, id: 99, position: 2 }] });
    expect(new Set(draft.items.map((i) => i.uid)).size).toBe(2);
  });

  it('detects changes via signature (order matters, tag order does not)', () => {
    const draft = draftFromLineup(lineup);
    const sig = draftSignature(draft);
    expect(draftSignature({ ...draft, tag_ids: [1, 5] })).toBe(sig);
    expect(draftSignature({ ...draft, items: moveUp(draft.items, 1) })).not.toBe(sig);
    expect(draftSignature({ ...draft, name: draft.name + ' ' })).toBe(sig); // trimmed
  });

  it('validates the name', () => {
    expect(validateDraft(emptyDraft(null)).name).toBeTruthy();
    expect(validateDraft(draftFromLineup(lineup))).toEqual({});
  });

  it('rebases onto the saved lineup while keeping uids', () => {
    const draft = draftFromLineup(lineup);
    const rebased = rebaseDraft(draft, { ...lineup, name: 'Renamed' });
    expect(rebased.name).toBe('Renamed');
    expect(rebased.items.map((i) => i.uid)).toEqual(draft.items.map((i) => i.uid));
  });
});
