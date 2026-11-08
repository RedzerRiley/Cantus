import type { FieldErrors } from './types';

export interface NormalizedError {
  /** A single human-readable message suitable for a banner or toast. */
  message: string;
  /** Per-field messages (DRF validation shape). `non_field_errors` is kept here too. */
  fieldErrors: FieldErrors;
}

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Can’t reach the server. Check your connection and try again.',
  401: 'Your session has ended. Please sign in again.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find that. It may have been deleted.',
  409: 'That conflicts with existing data.',
  413: 'That file is too large.',
  429: 'Too many requests. Please wait a moment and try again.',
};

function genericMessage(status: number): string {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status] as string;
  if (status >= 500) return 'Something went wrong on the server. Please try again.';
  return 'Something went wrong. Please try again.';
}

/** Flatten any nested DRF error value into a list of strings. */
function collectMessages(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [prefix + value];
  if (typeof value === 'number' || typeof value === 'boolean') return [prefix + String(value)];
  if (Array.isArray(value)) {
    // Nested list errors (e.g. items: [{}, {song: ["..."]}]) get a position prefix.
    const hasObjects = value.some((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
    return value.flatMap((v, i) => {
      if (hasObjects && v && typeof v === 'object' && !Array.isArray(v)) {
        return collectMessages(v, `${prefix}#${i + 1}: `);
      }
      return collectMessages(v, prefix);
    });
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      collectMessages(v, k === 'non_field_errors' || k === 'detail' ? prefix : `${prefix}${humanizeField(k)}: `),
    );
  }
  return [];
}

export function humanizeField(field: string): string {
  const s = field.replace(/_ids?$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Turn an HTTP status + parsed body into a consistent error shape.
 * Handles `{detail}`, DRF field errors, plain strings, arrays and junk.
 */
export function normalizeError(status: number, body: unknown): NormalizedError {
  const fieldErrors: FieldErrors = {};

  if (typeof body === 'string') {
    const text = body.trim();
    // Avoid dumping HTML error pages into the UI.
    const usable = text && !text.startsWith('<') && text.length < 300;
    return { message: usable ? text : genericMessage(status), fieldErrors };
  }

  if (Array.isArray(body)) {
    const msgs = collectMessages(body);
    if (msgs.length) fieldErrors.non_field_errors = msgs;
    return { message: msgs[0] ?? genericMessage(status), fieldErrors };
  }

  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.detail === 'string' && Object.keys(obj).length === 1) {
      return { message: obj.detail, fieldErrors };
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'detail') {
        const msgs = collectMessages(value);
        if (msgs.length) fieldErrors.non_field_errors = [...(fieldErrors.non_field_errors ?? []), ...msgs];
        continue;
      }
      const msgs = collectMessages(value);
      if (msgs.length) fieldErrors[key] = [...(fieldErrors[key] ?? []), ...msgs];
    }
    const nonField = fieldErrors.non_field_errors?.[0];
    const keys = Object.keys(fieldErrors).filter((k) => k !== 'non_field_errors');
    let message: string;
    if (nonField) {
      message = nonField;
    } else if (keys.length === 1) {
      const k = keys[0] as string;
      message = `${humanizeField(k)}: ${(fieldErrors[k] as string[])[0]}`;
    } else if (keys.length > 1) {
      message = 'Please correct the highlighted fields.';
    } else {
      message = genericMessage(status);
    }
    return { message, fieldErrors };
  }

  return { message: genericMessage(status), fieldErrors };
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, normalized: NormalizedError) {
    super(normalized.message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = normalized.fieldErrors;
  }

  /** First message for a field, if any. */
  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0];
  }
}

/** Best-effort message from anything thrown. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return genericMessage(-1);
}

export function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
