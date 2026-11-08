import { useId, useState, type KeyboardEvent } from 'react';
import type { ID, TagRef } from '../api/types';
import { tagsApi } from '../api/endpoints';
import { ApiError, errorMessage } from '../api/errors';
import { useCatalog } from '../catalog/CatalogContext';
import { ToggleChip } from './ui';
import { IconPlus } from './icons';

export interface TagPickerProps {
  legend: string;
  selected: ID[];
  onChange: (ids: ID[]) => void;
  /** Allow creating a new tag inline (POST tags/). */
  creatable?: boolean;
  /** Visually hide the legend. */
  hideLegend?: boolean;
  error?: string | null;
  /** Override the available tags (defaults to the workspace catalog). */
  tags?: TagRef[];
}

export function TagPicker({ legend, selected, onChange, creatable = false, hideLegend = false, error, tags: tagsProp }: TagPickerProps) {
  const catalog = useCatalog();
  const tags = tagsProp ?? catalog.tags;
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputId = useId();
  const errId = useId();

  const toggle = (id: ID) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selected.includes(existing.id)) onChange([...selected, existing.id]);
      setNewName('');
      setCreateError(null);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const tag = await tagsApi.create(name);
      catalog.upsertTag(tag);
      onChange([...selected, tag.id]);
      setNewName('');
    } catch (err) {
      setCreateError(err instanceof ApiError ? (err.field('name') ?? err.message) : errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // don't submit the surrounding form
      void create();
    }
  };

  return (
    <fieldset className="tag-picker" aria-describedby={error ? errId : undefined}>
      <legend className={hideLegend ? 'visually-hidden' : 'field__label'}>{legend}</legend>
      {tags.length === 0 ? (
        <p className="muted small">No tags yet.{creatable ? ' Create one below.' : ' Add tags in Settings.'}</p>
      ) : (
        <div className="chip-row">
          {tags.map((t) => (
            <ToggleChip key={t.id} pressed={selected.includes(t.id)} onToggle={() => toggle(t.id)}>
              {t.name}
            </ToggleChip>
          ))}
        </div>
      )}
      {creatable && (
        <div className="tag-picker__create">
          <label htmlFor={inputId} className="visually-hidden">
            New tag name
          </label>
          <input
            id={inputId}
            className="input input--sm"
            placeholder="New tag…"
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onKeyDown}
            aria-invalid={createError ? true : undefined}
            aria-describedby={createError ? `${inputId}-err` : undefined}
          />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void create()} disabled={!newName.trim() || creating}>
            <IconPlus size={16} /> {creating ? 'Adding…' : 'Add tag'}
          </button>
          {createError && (
            <p id={`${inputId}-err`} className="field-error" role="alert">
              {createError}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
