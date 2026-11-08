import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, normalizeError } from './errors';

describe('normalizeError', () => {
  it('uses {detail}', () => {
    expect(normalizeError(404, { detail: 'Not found.' })).toEqual({ message: 'Not found.', fieldErrors: {} });
  });

  it('keeps DRF field errors and summarises a single field', () => {
    const n = normalizeError(400, { title: ['This field is required.'] });
    expect(n.fieldErrors).toEqual({ title: ['This field is required.'] });
    expect(n.message).toBe('Title: This field is required.');
  });

  it('prefers non_field_errors for the message', () => {
    const n = normalizeError(400, { non_field_errors: ['Unable to log in with provided credentials.'], username: ['x'] });
    expect(n.message).toBe('Unable to log in with provided credentials.');
    expect(n.fieldErrors.username).toEqual(['x']);
  });

  it('gives a generic message for several fields', () => {
    expect(normalizeError(400, { a: ['1'], b: ['2'] }).message).toBe('Please correct the highlighted fields.');
  });

  it('flattens nested list errors (lineup items) with positions', () => {
    const n = normalizeError(400, { items: [{}, { song: ['Invalid pk "99" - object does not exist.'] }] });
    expect(n.fieldErrors.items).toEqual(['#2: Song: Invalid pk "99" - object does not exist.']);
  });

  it('handles plain strings, HTML pages, arrays and empty bodies', () => {
    expect(normalizeError(400, 'Bad thing').message).toBe('Bad thing');
    expect(normalizeError(500, '<!doctype html><html>…').message).toMatch(/server/);
    expect(normalizeError(400, ['oops']).message).toBe('oops');
    expect(normalizeError(0, null).message).toMatch(/reach the server/);
    expect(normalizeError(403, undefined).message).toMatch(/permission/);
  });
});

describe('ApiError', () => {
  it('exposes status, field errors and a helper', () => {
    const e = new ApiError(400, normalizeError(400, { file: ['Unsupported file type.'] }));
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(400);
    expect(e.field('file')).toBe('Unsupported file type.');
    expect(e.field('title')).toBeUndefined();
    expect(errorMessage(e)).toBe('File: Unsupported file type.');
  });
});
