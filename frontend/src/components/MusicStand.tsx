import type { ID } from '../api/types';
import { errorMessage } from '../api/errors';
import { openFileFrom } from '../api/openSongFile';
import { songsApi } from '../api/endpoints';
import { itemColorStyle } from '../lib/colors';
import { Button } from './ui';
import { IconExternal } from './icons';
import { SongFilePreview } from './SongFilePreview';
import { useToast } from './Toast';

export interface MusicStandItem {
  /** Stable React key. */
  key: string | number;
  songId: ID;
  title: string;
  composer: string;
  label: string;
  /** Effective key (lineup override or the song's own key). */
  musicKey: string;
  notes: string;
  hasFile: boolean;
  /** Song color label ('' = none). */
  color?: string;
}

type FileLoader = (songId: ID, signal?: AbortSignal) => Promise<Blob>;
const defaultLoader: FileLoader = (songId, signal) => songsApi.file(songId, signal);

/** Large, read-only rendering for use on a tablet at the music stand. */
export function MusicStand({ items, loadFile = defaultLoader }: { items: MusicStandItem[]; loadFile?: FileLoader }) {
  const toast = useToast();
  if (items.length === 0) {
    return <p className="stand-empty">No songs in this lineup yet.</p>;
  }
  return (
    <ol className="stand-list">
      {items.map((it, i) => (
        <li key={it.key} className="stand-item" style={itemColorStyle(it.color)}>
          <div className="stand-item__head">
            <span className="stand-item__num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="stand-item__body">
              {it.label && <span className="stand-item__label">{it.label}</span>}
              <span className="stand-item__title">{it.title}</span>
              <span className="stand-item__meta">{[it.musicKey && `Key ${it.musicKey}`, it.composer].filter(Boolean).join(' · ')}</span>
              {it.notes && <span className="stand-item__notes">{it.notes}</span>}
            </div>
            {it.hasFile && (
              <Button
                icon={<IconExternal size={18} />}
                onClick={() => openFileFrom(() => loadFile(it.songId), it.title).catch((e: unknown) => toast.error(errorMessage(e)))}
                aria-label={`Open file for “${it.title}” in a new tab`}
                title="Open in a new tab"
              >
                Open
              </Button>
            )}
          </div>
          {it.hasFile && <SongFilePreview songId={it.songId} title={it.title} load={(signal) => loadFile(it.songId, signal)} />}
        </li>
      ))}
    </ol>
  );
}
