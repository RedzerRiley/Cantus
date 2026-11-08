import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { itemColorStyle } from '../lib/colors';
import type { DraftItem } from '../lib/lineupDraft';
import { LABEL_SUGGESTIONS } from '../lib/lineupDraft';
import { describeMove, moveItem, removeAt, targetIndex, type MoveDirection } from '../lib/reorder';
import { Menu } from './Menu';
import { IconChevronDown, IconChevronUp, IconGrip, IconToBottom, IconToTop, IconTrash } from './icons';

export interface LineupItemListProps {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  /** Screen-reader announcement (rendered by the parent in an aria-live region). */
  announce: (message: string) => void;
  /** Client validation errors keyed like "items.2.label". */
  errors?: Record<string, string>;
  /** Called after the last item is removed so focus can go somewhere sensible. */
  onEmptied?: () => void;
  /** Called when a song's Part was edited and the field lost focus (used for auto-sorting). */
  onPartCommit?: () => void;
}

const DATALIST_ID = 'lineup-label-suggestions';

export function LineupItemList({ items, onChange, announce, errors = {}, onEmptied, onPartCommit }: LineupItemListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // The Part value when its field gained focus, to tell whether it was edited.
  const partAtFocus = useRef<string | null>(null);
  const focusRequest = useRef<{ uid: string; target: MoveDirection | 'first' } | null>(null);
  const [armedUid, setArmedUid] = useState<string | null>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Restore focus after a reorder (moving DOM nodes can drop focus) or removal.
  useEffect(() => {
    const req = focusRequest.current;
    if (!req || !listRef.current) return;
    focusRequest.current = null;
    const row = listRef.current.querySelector<HTMLElement>(`[data-uid="${req.uid}"]`);
    if (!row) return;
    const pick = (dir: string) => row.querySelector<HTMLButtonElement>(`[data-move="${dir}"]:not([disabled])`);
    let el: HTMLElement | null = null;
    if (req.target === 'up' || req.target === 'top') el = pick('up') ?? pick('down');
    else if (req.target === 'down' || req.target === 'bottom') el = pick('down') ?? pick('up');
    el = el ?? row.querySelector<HTMLElement>('[data-move]:not([disabled]), input');
    el?.focus();
  }, [items]);

  const move = (index: number, direction: MoveDirection) => {
    const to = targetIndex(items.length, index, direction);
    if (to === null) return;
    const item = items[index] as DraftItem;
    focusRequest.current = { uid: item.uid, target: direction };
    onChange(moveItem(items, index, to));
    announce(describeMove(item.song_detail.title, to, items.length));
  };

  const remove = (index: number) => {
    const item = items[index] as DraftItem;
    const next = removeAt(items, index);
    const neighbour = next[index] ?? next[index - 1];
    if (neighbour) focusRequest.current = { uid: neighbour.uid, target: 'first' };
    onChange(next);
    announce(`Removed “${item.song_detail.title}” from the lineup. ${next.length} ${next.length === 1 ? 'song' : 'songs'} left.`);
    if (next.length === 0) onEmptied?.();
  };

  const update = (index: number, patch: Partial<DraftItem>) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (!e.altKey) return;
    const map: Record<string, MoveDirection> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'top', End: 'bottom' };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      move(index, dir);
    }
  };

  // --- Native drag & drop (mouse enhancement; buttons remain the primary way) ---
  const onDragStart = (e: DragEvent<HTMLLIElement>, uid: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uid);
    setDragUid(uid);
  };
  const onDragOver = (e: DragEvent<HTMLLIElement>, index: number) => {
    if (!dragUid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  };
  const endDrag = () => {
    setDragUid(null);
    setArmedUid(null);
    setOverIndex(null);
  };
  const onDrop = (e: DragEvent<HTMLLIElement>, index: number) => {
    e.preventDefault();
    const from = items.findIndex((it) => it.uid === dragUid);
    endDrag();
    if (from < 0 || from === index) return;
    const item = items[from] as DraftItem;
    onChange(moveItem(items, from, index));
    announce(describeMove(item.song_detail.title, index, items.length));
  };

  return (
    <>
      <datalist id={DATALIST_ID}>
        {LABEL_SUGGESTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <p className="small muted reorder-hint" id="reorder-hint">
        Use the arrow buttons to reorder. Keyboard: Alt + ↑/↓ moves the focused song; Alt + Home/End moves it to the top/bottom.
      </p>
      <ol ref={listRef} className="item-list" aria-label="Songs in this lineup" aria-describedby="reorder-hint">
        {items.map((item, index) => {
          const title = item.song_detail.title;
          const idBase = `item-${item.uid}`;
          const errLabel = errors[`items.${index}.label`];
          const errKey = errors[`items.${index}.key`];
          const cls = ['item-row', dragUid === item.uid ? 'is-dragging' : '', overIndex === index && dragUid && dragUid !== item.uid ? 'is-drop-target' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={item.uid}
              data-uid={item.uid}
              className={cls}
              style={itemColorStyle(item.song_detail.color)}
              onKeyDown={(e) => onRowKeyDown(e, index)}
              draggable={armedUid === item.uid}
              onDragStart={(e) => onDragStart(e, item.uid)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={endDrag}
            >
              <div className="item-row__head">
                <span
                  className="item-row__grip"
                  aria-hidden="true"
                  title="Drag to reorder"
                  onPointerDown={() => setArmedUid(item.uid)}
                  onPointerUp={() => !dragUid && setArmedUid(null)}
                >
                  <IconGrip size={18} />
                </span>
                <span className="item-row__pos" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="item-row__song">
                  <span className="item-row__title">{title}</span>
                  <span className="item-row__meta">
                    {[item.song_detail.composer, item.song_detail.language_name, item.song_detail.key && `Song key ${item.song_detail.key}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="item-row__reorder">
                  <button type="button" className="icon-btn" data-move="up" disabled={index === 0} onClick={() => move(index, 'up')} aria-label={`Move “${title}” up`}>
                    <IconChevronUp />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-move="down"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 'down')}
                    aria-label={`Move “${title}” down`}
                  >
                    <IconChevronDown />
                  </button>
                  <Menu
                    label={`More actions for “${title}”`}
                    items={[
                      { label: 'Move to top', icon: <IconToTop size={18} />, disabled: index === 0, onSelect: () => move(index, 'top') },
                      { label: 'Move to bottom', icon: <IconToBottom size={18} />, disabled: index === items.length - 1, onSelect: () => move(index, 'bottom') },
                      { label: 'Remove from lineup', icon: <IconTrash size={18} />, danger: true, onSelect: () => remove(index) },
                    ]}
                  />
                </div>
              </div>

              <div className="item-row__fields">
                <div className={`field field--compact${errLabel ? ' field--invalid' : ''}`}>
                  <label htmlFor={`${idBase}-label`} className="field__label">
                    Part
                  </label>
                  <input
                    id={`${idBase}-label`}
                    className="input"
                    list={DATALIST_ID}
                    maxLength={60}
                    placeholder="e.g. Entrance"
                    value={item.label}
                    onFocus={() => {
                      partAtFocus.current = item.label;
                    }}
                    onBlur={() => {
                      const changed = partAtFocus.current !== null && partAtFocus.current !== item.label;
                      partAtFocus.current = null;
                      if (changed) onPartCommit?.();
                    }}
                    onChange={(e) => update(index, { label: e.target.value })}
                    aria-invalid={errLabel ? true : undefined}
                    aria-describedby={errLabel ? `${idBase}-label-err` : undefined}
                  />
                  {errLabel && (
                    <p id={`${idBase}-label-err`} className="field-error">
                      {errLabel}
                    </p>
                  )}
                </div>
                <div className={`field field--compact field--key${errKey ? ' field--invalid' : ''}`}>
                  <label htmlFor={`${idBase}-key`} className="field__label">
                    Key
                  </label>
                  <input
                    id={`${idBase}-key`}
                    className="input"
                    maxLength={20}
                    placeholder={item.song_detail.key || '—'}
                    value={item.key}
                    onChange={(e) => update(index, { key: e.target.value })}
                    aria-invalid={errKey ? true : undefined}
                    aria-describedby={errKey ? `${idBase}-key-err` : undefined}
                  />
                  {errKey && (
                    <p id={`${idBase}-key-err`} className="field-error">
                      {errKey}
                    </p>
                  )}
                </div>
              </div>

              <details className="item-row__notes">
                <summary>
                  Notes{item.notes ? <span className="item-row__notes-preview">: {item.notes.split('\n')[0]}</span> : ''}
                </summary>
                <label htmlFor={`${idBase}-notes`} className="visually-hidden">
                  Notes for “{title}”
                </label>
                <textarea id={`${idBase}-notes`} className="input" rows={2} value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} />
              </details>
            </li>
          );
        })}
      </ol>
    </>
  );
}
