import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../api';

type Item = { id: number; name: string; type: string };
let cache: Item[] | null = null; // what you own, loaded once and again after something is added
const load = async () => (cache ??= (await api<{ own: Item[] }>('/gear/items')).own);

/**
 * A camera or lens box that searches what is in your Gear list as you type, and can add a new one to it.
 * `onCommit` gets the final text (a gear name, or whatever was typed) when you pick, press Enter, or leave the box.
 */
export function GearPicker({ value, kind, placeholder, title, style, className, onCommit }: { value: string; kind: 'camera' | 'lens'; placeholder?: string; title?: string; style?: CSSProperties; className?: string; onCommit: (name: string) => void }) {
  const [text, setText] = useState(value);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);

  const q = text.trim().toLowerCase();
  const pool = items.filter((i) => i.type === kind);
  const options = [
    ...pool.filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 8).map((i) => ({ name: i.name, add: false })),
    ...(q && !pool.some((i) => i.name.toLowerCase() === q) ? [{ name: text.trim(), add: true }] : []),
  ];

  const commit = async (name: string, add = false) => {
    setOpen(false); setHi(-1); setText(name);
    if (add) { try { await api('/gear/items', { body: { kind: 'own', name, type: kind } }); cache = null; } catch { /* still used on the photograph, just not added to Gear */ } }
    if (name !== value) onCommit(name);
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <input ref={input} value={text} placeholder={placeholder} title={title} className={className} size={Math.max(8, text.length || (placeholder?.length ?? 8))} style={style}
        onFocus={() => { setOpen(true); void load().then(setItems).catch(() => undefined); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(-1); }}
        onBlur={() => { if (open) { setOpen(false); if (text.trim() !== value) onCommit(text.trim()); } }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
          else if (e.key === 'Enter') { e.preventDefault(); const o = options[hi]; if (o) void commit(o.name, o.add); else void commit(text.trim()); input.current?.blur(); }
          else if (e.key === 'Escape') { e.stopPropagation(); setText(value); setOpen(false); input.current?.blur(); }
        }} />
      {open && options.length > 0 && (
        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 70, marginTop: 4, minWidth: 240, maxWidth: 360, padding: 4, borderRadius: 10, background: 'var(--raised)', boxShadow: '0 0 0 1px var(--hair), 0 12px 32px rgba(0,0,0,.45)', textAlign: 'left' }}>
          {options.map((o, k) => (
            <div key={o.name + o.add} role="option" aria-selected={k === hi}
              onMouseDown={(e) => { e.preventDefault(); void commit(o.name, o.add); input.current?.blur(); }} onMouseEnter={() => setHi(k)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13.5, color: o.add ? 'var(--text)' : 'var(--text2)', background: k === hi ? 'var(--hover)' : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {o.add ? <>+ Add “{o.name}” to your gear</> : o.name}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
