import { describe, expect, it } from 'vitest';
import { describeMove, moveDown, moveItem, moveToBottom, moveToTop, moveUp, removeAt, targetIndex } from './reorder';

const list = ['a', 'b', 'c', 'd'];

describe('reorder', () => {
  it('moves an item to a new index without mutating the input', () => {
    const out = moveItem(list, 0, 2);
    expect(out).toEqual(['b', 'c', 'a', 'd']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps the destination index', () => {
    expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(list, 2, -5)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores an out-of-range source index', () => {
    expect(moveItem(list, 7, 0)).toEqual(list);
  });

  it('moves up / down / top / bottom', () => {
    expect(moveUp(list, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveDown(list, 2)).toEqual(['a', 'b', 'd', 'c']);
    expect(moveToTop(list, 3)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveToBottom(list, 0)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('is a no-op at the edges', () => {
    expect(moveUp(list, 0)).toEqual(list);
    expect(moveDown(list, 3)).toEqual(list);
  });

  it('supports duplicate values (same song twice)', () => {
    expect(moveItem(['x', 'y', 'x'], 2, 0)).toEqual(['x', 'x', 'y']);
  });

  it('removes by index', () => {
    expect(removeAt(list, 1)).toEqual(['a', 'c', 'd']);
    expect(removeAt(list, 10)).toEqual(list);
  });

  it('computes target indexes and no-ops', () => {
    expect(targetIndex(4, 0, 'up')).toBeNull();
    expect(targetIndex(4, 3, 'down')).toBeNull();
    expect(targetIndex(4, 0, 'top')).toBeNull();
    expect(targetIndex(4, 2, 'top')).toBe(0);
    expect(targetIndex(4, 1, 'bottom')).toBe(3);
    expect(targetIndex(4, 1, 'down')).toBe(2);
    expect(targetIndex(0, 0, 'down')).toBeNull();
  });

  it('describes a move for screen readers (1-based)', () => {
    expect(describeMove('Pange Lingua', 1, 5)).toBe('“Pange Lingua” moved to position 2 of 5.');
  });
});
