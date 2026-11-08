import { describe, expect, it } from 'vitest';
import { displayName, formatFileSize, formatRelativeTime, pluralize } from './format';

describe('formatFileSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(980)).toBe('980 B');
    expect(formatFileSize(48213)).toBe('47.1 KB');
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe('3.3 MB');
    expect(formatFileSize(150 * 1024)).toBe('150 KB');
  });
  it('returns empty string for null/invalid', () => {
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(-1)).toBe('');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  it('formats recent times', () => {
    expect(formatRelativeTime('2026-06-15T11:59:50Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-06-15T11:55:00Z', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-06-15T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-06-14T10:00:00Z', now)).toBe('yesterday');
    expect(formatRelativeTime('2026-06-12T12:00:00Z', now)).toBe('3 days ago');
  });
  it('handles empty/invalid input', () => {
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime('garbage', now)).toBe('');
  });
});

describe('misc', () => {
  it('pluralizes', () => {
    expect(pluralize(1, 'song')).toBe('1 song');
    expect(pluralize(3, 'song')).toBe('3 songs');
  });
  it('displayName falls back to username', () => {
    expect(displayName({ username: 'ana', first_name: 'Ana', last_name: 'Cruz' })).toBe('Ana Cruz');
    expect(displayName({ username: 'ben', first_name: ' ', last_name: '' })).toBe('ben');
  });
});
