import { describe, expect, it } from 'vitest';
import { FILE_ACCEPT, getExtension, MAX_UPLOAD_BYTES, validateUpload } from './files';

describe('getExtension', () => {
  it('extracts lowercase extensions', () => {
    expect(getExtension('Song.PDF')).toBe('pdf');
    expect(getExtension('a.b.chopro')).toBe('chopro');
    expect(getExtension('C:\\x\\y.jpeg')).toBe('jpeg');
  });
  it('handles missing extensions and dotfiles', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('.hidden')).toBe('');
    expect(getExtension('trailing.')).toBe('');
  });
});

describe('validateUpload', () => {
  it('accepts allowed types within the size limit', () => {
    for (const name of ['a.pdf', 'b.png', 'c.jpg', 'd.jpeg', 'e.txt', 'f.cho', 'g.chopro']) {
      expect(validateUpload({ name, size: 1000 })).toBeNull();
    }
  });
  it('rejects other extensions', () => {
    expect(validateUpload({ name: 'song.docx', size: 1000 })).toMatch(/supported file type/);
    expect(validateUpload({ name: 'noext', size: 1000 })).toMatch(/supported file type/);
  });
  it('rejects files over 10 MB and empty files', () => {
    expect(validateUpload({ name: 'big.pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/10 MB/);
    expect(validateUpload({ name: 'ok.pdf', size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(validateUpload({ name: 'empty.txt', size: 0 })).toMatch(/empty/);
  });
  it('builds the accept attribute', () => {
    expect(FILE_ACCEPT).toBe('.pdf,.png,.jpg,.jpeg,.txt,.cho,.chopro,application/pdf,image/png,image/jpeg,text/plain');
  });
});
