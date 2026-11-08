import { songsApi } from './endpoints';
import type { ID } from './types';

/**
 * Open a song's private file in a new tab.
 * The file endpoint needs the auth header, so we fetch it as a blob and hand
 * the browser an object URL. A tab is opened synchronously (inside the click)
 * to avoid popup blockers; if that fails we fall back to a download link.
 */
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
};

/** Ensure the download fallback has a file extension (callers may pass a song title). */
export function withExtension(name: string, mimeType: string): string {
  if (/\.[a-z0-9]{2,6}$/i.test(name)) return name;
  const ext = EXT_BY_TYPE[mimeType.split(';')[0].trim()];
  return ext ? `${name}.${ext}` : name;
}

export function openSongFile(id: ID, fileName: string | null): Promise<void> {
  return openFileFrom(() => songsApi.file(id), fileName);
}

/** Same as openSongFile, for any blob source (e.g. a public share link). */
export async function openFileFrom(load: () => Promise<Blob>, fileName: string | null): Promise<void> {
  const win = window.open('', '_blank');
  if (win) {
    try {
      win.document.title = fileName ?? 'Opening file…';
      win.document.body.style.fontFamily = 'system-ui, sans-serif';
      win.document.body.textContent = 'Opening file…';
    } catch {
      /* cross-origin edge cases — ignore */
    }
  }
  let blob: Blob;
  try {
    blob = await load();
  } catch (err) {
    win?.close();
    throw err;
  }
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) {
    win.location.href = url;
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = withExtension(fileName ?? 'song-file', blob.type);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Give the new tab time to load before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
