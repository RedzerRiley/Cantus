// Pure, immutable list operations used by the lineup editor.

/** Move the element at `from` to index `to` (both clamped). Returns a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = list.slice();
  if (from < 0 || from >= copy.length) return copy;
  const target = Math.max(0, Math.min(copy.length - 1, to));
  if (target === from) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item as T);
  return copy;
}

export const moveUp = <T>(list: readonly T[], index: number): T[] => moveItem(list, index, index - 1);
export const moveDown = <T>(list: readonly T[], index: number): T[] => moveItem(list, index, index + 1);
export const moveToTop = <T>(list: readonly T[], index: number): T[] => moveItem(list, index, 0);
export const moveToBottom = <T>(list: readonly T[], index: number): T[] => moveItem(list, index, list.length - 1);

export function removeAt<T>(list: readonly T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list.slice();
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

export type MoveDirection = 'up' | 'down' | 'top' | 'bottom';

/** Destination index for a move, or null if the move is a no-op. */
export function targetIndex(length: number, index: number, direction: MoveDirection): number | null {
  if (index < 0 || index >= length) return null;
  let to: number;
  switch (direction) {
    case 'up':
      to = index - 1;
      break;
    case 'down':
      to = index + 1;
      break;
    case 'top':
      to = 0;
      break;
    case 'bottom':
      to = length - 1;
      break;
  }
  if (to < 0 || to >= length || to === index) return null;
  return to;
}

/** Screen-reader announcement, e.g. “Pange Lingua” moved to position 2 of 5. */
export function describeMove(title: string, newIndex: number, length: number): string {
  return `“${title}” moved to position ${newIndex + 1} of ${length}.`;
}
