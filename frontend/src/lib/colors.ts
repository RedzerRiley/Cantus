import type { CSSProperties } from 'react';

/** Must match backend `ItemColor` choices. */
export const ITEM_COLORS = [
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
] as const;

/** '' means "no color" (the default gold accent is used). */
export type ItemColor = (typeof ITEM_COLORS)[number]['value'] | '';

export function isItemColor(value: unknown): value is ItemColor {
  return value === '' || ITEM_COLORS.some((c) => c.value === value);
}

export function colorLabel(color: string | null | undefined): string | null {
  return ITEM_COLORS.find((c) => c.value === color)?.label ?? null;
}

/**
 * Inline style that sets `--item-color`, which card/row stripes read
 * (falling back to the accent). Unknown values are ignored.
 */
export function itemColorStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !isItemColor(color)) return undefined;
  return { '--item-color': `var(--color-${color})` } as CSSProperties;
}
