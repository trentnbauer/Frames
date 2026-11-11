import { useState } from 'react';

/** The "+ Add" at the end of a row of chips: click it, type a name, press Enter (or leave the box) to add it. Escape cancels. */
export function AddChip({ onAdd, label }: { onAdd: (name: string) => void | Promise<unknown>; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const done = () => { const n = text.trim(); setText(''); setOpen(false); if (n) void onAdd(n); };
  if (!open) return <span role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }} style={{ height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 8px', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>+ Add</span>;
  return <input autoFocus value={text} placeholder={`Add a ${label}`} aria-label={`Add a ${label}`} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setText(''); setOpen(false); } }}
    style={{ height: 30, width: 150, borderRadius: 999, border: 0, outline: 'none', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', padding: '0 12px', font: "400 13px 'IBM Plex Sans',sans-serif" }} />;
}
