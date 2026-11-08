import { describe, expect, it } from 'vitest';
import { buildQuery, parseIdList } from './query';

describe('buildQuery', () => {
  it('returns empty string for no params', () => {
    expect(buildQuery(undefined)).toBe('');
    expect(buildQuery({})).toBe('');
    expect(buildQuery({ a: undefined, b: null, c: '  ', d: [] })).toBe('');
  });

  it('joins arrays with commas and trims strings', () => {
    expect(buildQuery({ search: '  Ama Namin ', tags: [3, 5], page: 2 })).toBe('?search=Ama+Namin&tags=3%2C5&page=2');
  });

  it('keeps zero and false', () => {
    expect(buildQuery({ n: 0, flag: false })).toBe('?n=0&flag=false');
  });

  it('encodes unicode (Tagalog/Taglish titles)', () => {
    const q = buildQuery({ search: 'Pananagutan — ñ' });
    expect(new URLSearchParams(q).get('search')).toBe('Pananagutan — ñ');
  });
});

describe('parseIdList', () => {
  it('parses valid ids and drops junk', () => {
    expect(parseIdList('1, 2,x,,-3,4')).toEqual([1, 2, 4]);
    expect(parseIdList(null)).toEqual([]);
  });
});
