import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LineupItemList } from './LineupItemList';
import type { DraftItem } from '../lib/lineupDraft';

function item(uid: string, title: string): DraftItem {
  return {
    uid,
    song: Number(uid.replace(/\D/g, '')) || 1,
    song_detail: { id: 1, title, composer: '', key: 'G', language_name: 'Latin', has_file: false },
    label: '',
    key: '',
    notes: '',
    assigned_to: '',
  };
}

function Harness({ initial }: { initial: DraftItem[] }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState('');
  return (
    <>
      <LineupItemList items={items} onChange={setItems} announce={setMsg} />
      <div data-testid="live" aria-live="polite">
        {msg}
      </div>
    </>
  );
}

const titles = () =>
  within(screen.getByRole('list', { name: 'Songs in this lineup' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.item-row__title')?.textContent);

describe('LineupItemList', () => {
  const initial = [item('a1', 'Kyrie'), item('b2', 'Pange Lingua'), item('c3', 'Salve Regina')];

  it('moves a song up with an accessible button and announces it', () => {
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move “Pange Lingua” up' }));
    expect(titles()).toEqual(['Pange Lingua', 'Kyrie', 'Salve Regina']);
    expect(screen.getByTestId('live')).toHaveTextContent('“Pange Lingua” moved to position 1 of 3.');
  });

  it('disables impossible moves', () => {
    render(<Harness initial={initial} />);
    expect(screen.getByRole('button', { name: 'Move “Kyrie” up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move “Salve Regina” down' })).toBeDisabled();
  });

  it('keeps focus on the moved row', () => {
    render(<Harness initial={initial} />);
    const btn = screen.getByRole('button', { name: 'Move “Kyrie” down' });
    btn.focus();
    fireEvent.click(btn);
    expect(titles()).toEqual(['Pange Lingua', 'Kyrie', 'Salve Regina']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move “Kyrie” down' }));
  });

  it('supports Alt+Arrow and Alt+End keyboard shortcuts', () => {
    render(<Harness initial={initial} />);
    const kyrieLabel = screen.getAllByLabelText('Part')[0]!;
    fireEvent.keyDown(kyrieLabel, { key: 'End', altKey: true });
    expect(titles()).toEqual(['Pange Lingua', 'Salve Regina', 'Kyrie']);
    fireEvent.keyDown(screen.getAllByLabelText('Part')[2]!, { key: 'ArrowUp', altKey: true });
    expect(titles()).toEqual(['Pange Lingua', 'Kyrie', 'Salve Regina']);
  });

  it('moves to top and removes via the overflow menu', () => {
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions for “Salve Regina”' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to top' }));
    expect(titles()).toEqual(['Salve Regina', 'Kyrie', 'Pange Lingua']);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for “Kyrie”' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from lineup' }));
    expect(titles()).toEqual(['Salve Regina', 'Pange Lingua']);
    expect(screen.getByTestId('live')).toHaveTextContent('Removed “Kyrie”');
  });

  it('edits per-item fields and shows the song key as placeholder', () => {
    render(<Harness initial={initial} />);
    const key = screen.getAllByLabelText('Key')[0] as HTMLInputElement;
    expect(key.placeholder).toBe('G');
    fireEvent.change(key, { target: { value: 'A' } });
    expect((screen.getAllByLabelText('Key')[0] as HTMLInputElement).value).toBe('A');
  });
});
