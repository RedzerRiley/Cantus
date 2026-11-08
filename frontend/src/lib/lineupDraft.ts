import type { ID, Lineup, LineupItemWrite, LineupWrite, Song, SongDetailBrief } from '../api/types';
import { isItemColor, type ItemColor } from './colors';

/** An item being edited. `uid` is a client-side key (the same song may appear twice). */
export interface DraftItem {
  uid: string;
  song: ID;
  song_detail: SongDetailBrief;
  label: string;
  key: string;
  notes: string;
  assigned_to: string;
}

export interface LineupDraft {
  name: string;
  description: string;
  default_language: ID | null;
  color: ItemColor;
  tag_ids: ID[];
  items: DraftItem[];
}

let uidCounter = 0;
export function nextUid(): string {
  uidCounter += 1;
  return `i${Date.now().toString(36)}${uidCounter}`;
}

export function emptyDraft(defaultLanguage: ID | null): LineupDraft {
  return { name: '', description: '', default_language: defaultLanguage, color: '', tag_ids: [], items: [] };
}

export function draftFromLineup(lineup: Lineup): LineupDraft {
  return {
    name: lineup.name,
    description: lineup.description ?? '',
    default_language: lineup.default_language,
    color: isItemColor(lineup.color) ? lineup.color : '',
    tag_ids: lineup.tags.map((t) => t.id),
    items: [...lineup.items]
      .sort((a, b) => a.position - b.position)
      .map((it) => ({
        uid: nextUid(),
        song: it.song,
        song_detail: it.song_detail,
        label: it.label ?? '',
        key: it.key ?? '',
        notes: it.notes ?? '',
        assigned_to: it.assigned_to ?? '',
      })),
  };
}

export function songToBrief(song: Song): SongDetailBrief {
  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    key: song.key,
    color: song.color ?? '',
    language_name: song.language_name,
    has_file: song.has_file,
  };
}

export function draftItemFromSong(song: Song): DraftItem {
  return { uid: nextUid(), song: song.id, song_detail: songToBrief(song), label: '', key: '', notes: '', assigned_to: '' };
}

export function toLineupWrite(draft: LineupDraft): LineupWrite {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    default_language: draft.default_language,
    color: draft.color,
    tag_ids: [...draft.tag_ids],
    items: draft.items.map(
      (it): LineupItemWrite => ({
        song: it.song,
        label: it.label.trim(),
        key: it.key.trim(),
        notes: it.notes,
        assigned_to: it.assigned_to.trim(),
      }),
    ),
  };
}

/** Stable serialisation used for dirty-checking (ignores uids & tag order). */
export function draftSignature(draft: LineupDraft): string {
  const w = toLineupWrite(draft);
  return JSON.stringify({ ...w, tag_ids: [...(w.tag_ids ?? [])].sort((a, b) => a - b) });
}

export function validateDraft(draft: LineupDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = 'Give the lineup a name, e.g. “Sunday Mass — Tagalog”.';
  else if (draft.name.trim().length > 200) errors.name = 'Keep the name to 200 characters or fewer.';
  draft.items.forEach((it, i) => {
    if (it.label.trim().length > 60) errors[`items.${i}.label`] = 'Label must be 60 characters or fewer.';
    if (it.key.trim().length > 20) errors[`items.${i}.key`] = 'Key must be 20 characters or fewer.';
    if (it.assigned_to.trim().length > 120) errors[`items.${i}.assigned_to`] = 'Keep this to 120 characters or fewer.';
  });
  return errors;
}

export const LABEL_SUGGESTIONS = [
  'Entrance',
  'Kyrie',
  'Gloria',
  'Responsorial Psalm',
  'Gospel Acclamation',
  'Offertory',
  'Holy Holy',
  'Mystery of Faith',
  'Great Amen',
  'Lamb of God',
  'Communion',
  'Thanksgiving',
  'Recessional',
] as const;

/**
 * After a save, adopt the server's canonical values but keep the client uids
 * (by position) so React keeps DOM nodes/focus stable.
 */
export function rebaseDraft(current: LineupDraft, saved: Lineup): LineupDraft {
  const next = draftFromLineup(saved);
  return {
    ...next,
    items: next.items.map((it, i) => ({ ...it, uid: current.items[i]?.uid ?? it.uid })),
  };
}
