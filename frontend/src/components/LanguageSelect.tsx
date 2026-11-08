import type { ID } from '../api/types';
import { useCatalog } from '../catalog/CatalogContext';
import type { FieldControlProps } from './FormField';

export interface LanguageSelectProps extends Partial<FieldControlProps> {
  value: ID | null;
  onChange: (value: ID | null) => void;
  /** Label of the empty option, e.g. "All languages" for filters or "No language" for forms. */
  emptyLabel?: string;
  className?: string;
}

export function LanguageSelect({ value, onChange, emptyLabel = 'No language', className, ...control }: LanguageSelectProps) {
  const { languages } = useCatalog();
  return (
    <select
      {...control}
      className={['input', className].filter(Boolean).join(' ')}
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{emptyLabel}</option>
      {languages.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
      {value !== null && !languages.some((l) => l.id === value) && <option value={value}>Unknown language</option>}
    </select>
  );
}
