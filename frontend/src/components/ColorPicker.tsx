import { useId } from 'react';
import { ITEM_COLORS, type ItemColor } from '../lib/colors';
import { IconCheck, IconX } from './icons';

/** Swatch radio group for a song/lineup color label. */
export function ColorPicker({ value, onChange, legend = 'Color' }: { value: ItemColor; onChange: (c: ItemColor) => void; legend?: string }) {
  const name = useId();
  const options: { value: ItemColor; label: string }[] = [{ value: '', label: 'No color' }, ...ITEM_COLORS];
  return (
    <fieldset className="color-picker">
      <legend className="field__label">{legend}</legend>
      <div className="color-picker__swatches">
        {options.map((opt) => {
          const checked = value === opt.value;
          return (
            <label key={opt.value || 'none'} className="color-picker__option" title={opt.label}>
              <input
                type="radio"
                className="visually-hidden-input"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                aria-label={opt.label}
              />
              <span
                className={`color-picker__swatch${opt.value ? '' : ' color-picker__swatch--none'}`}
                style={opt.value ? { background: `var(--color-${opt.value})` } : undefined}
                aria-hidden="true"
              >
                {checked ? <IconCheck size={16} /> : !opt.value ? <IconX size={14} /> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
