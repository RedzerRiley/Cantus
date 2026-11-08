export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;

/**
 * Build a query string ("?a=1&b=2") from a params object.
 * - undefined / null / '' / empty arrays are skipped
 * - arrays become comma-separated values (the API's format for `tags`)
 * - strings are trimmed
 * Returns '' when nothing remains.
 */
export function buildQuery(params: Record<string, QueryValue> | undefined): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      sp.set(key, value.join(','));
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      sp.set(key, trimmed);
      continue;
    }
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Parse a comma-separated id list ("1,2,x") into numbers, dropping junk. */
export function parseIdList(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}
