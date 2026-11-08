export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'cho', 'chopro'] as const;
export const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * MIME types listed alongside the extensions so Safari's macOS file picker
 * (which maps `accept` to system file types and doesn't know .cho/.chopro)
 * still lets users select PDFs, images and text files in Finder.
 */
const ACCEPT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

/** Value for an <input type="file" accept>. */
export const FILE_ACCEPT = [...ALLOWED_EXTENSIONS.map((e) => `.${e}`), ...ACCEPT_MIME_TYPES].join(',');

/** Lower-cased extension without dot, or '' if none. */
export function getExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export interface FileLike {
  name: string;
  size: number;
}

/**
 * Client-side pre-check mirroring the server rules (extension + size).
 * Returns an error message, or null if the file looks acceptable.
 * The server still sniffs content and has the final say.
 */
export function validateUpload(file: FileLike, maxBytes: number = MAX_UPLOAD_BYTES): string | null {
  const ext = getExtension(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `“${file.name}” isn’t a supported file type. Use PDF, PNG, JPG, TXT or ChordPro (.cho, .chopro).`;
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return `That file is too large. The limit is ${mb} MB.`;
  }
  return null;
}
