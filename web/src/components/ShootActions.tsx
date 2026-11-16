import { useEffect, useRef, useState } from 'react';
import { confirmAction } from './dialogs';
export function ShootActions({ name, count, aiOn, onAnalyse, onDelete, onAddPhotos, protectedShoot, onToggleProtection }: { name: string; count: number; aiOn: boolean; onAnalyse: () => Promise<string>; onDelete: () => Promise<void>; onAddPhotos?: () => void; protectedShoot?: boolean; onToggleProtection?: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const run = async (remove: boolean) => {
    setOpen(false);
    if (remove && !await confirmAction(`Remove “${name}” and all ${count} photos from Frames?\n\nTheir reviews, tags and composition placements will be removed. Shared links will stop working. Original files are kept. You can restore the shoot during the recovery period.`)) return;
    setBusy(true); setMessage('');
    try { if (remove) await onDelete(); else setMessage(await onAnalyse()); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <span ref={root} style={{ position: 'relative', display: 'inline-flex' }}><button ref={trigger} className="btn outline" style={{ width: 40, height: 40, padding: 0, borderRadius: 999 }} aria-label="Shoot actions" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>⋯</button>{open && <div className="menu" role="menu" aria-label="Shoot actions" style={{ top: 48, right: 0, width: 240 }}>{onAddPhotos && <button role="menuitem" onClick={() => { setOpen(false); onAddPhotos(); }}>Add photos</button>}<button role="menuitem" disabled={!aiOn} onClick={() => void run(false)}>✦ Analyse with AI</button>{onToggleProtection && <button role="menuitem" onClick={() => { setOpen(false); setBusy(true); void onToggleProtection().catch((error) => setMessage((error as Error).message)).finally(() => setBusy(false)); }}>{protectedShoot ? 'Unlock shoot deletion' : 'Protect shoot from deletion'}</button>}<button role="menuitem" disabled={protectedShoot} style={{ color: 'var(--danger)' }} onClick={() => void run(true)}>Remove shoot from Frames…</button></div>}{message && <span role="status" style={{ position: 'absolute', right: 0, top: 48, width: 280, padding: 12, background: 'var(--raised2)', borderRadius: 12, zIndex: 10 }}>{message}</span>}</span>;
}
