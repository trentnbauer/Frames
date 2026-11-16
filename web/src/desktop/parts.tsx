import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { CompPicker } from '../components/AddToComposition';
import { Modal } from '../components/Modal';
import { useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import { imgUrl } from '../api';

const mono = "'IBM Plex Mono',monospace";
export const serif = "'Instrument Serif',Georgia,serif";

/** The padlock the design uses for protected shoots. */
export const Lock = ({ size = 15, open = false }: { size?: number; open?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="3.5" y="8" width="11" height="7.5" rx="1.5" /><path d={open ? 'M6 8V5.8a3 3 0 0 1 5.6-1.5' : 'M6 8V5.8a3 3 0 0 1 6 0V8'} /></svg>
);

/** A short message at the top of the page, with an optional Undo. */
export function useToast() {
  const [t, setT] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => { if (!t) return; const id = window.setTimeout(() => setT(null), t.undo ? 5000 : 2600); return () => window.clearTimeout(id); }, [t]);
  const node = t && (
    <div role="status" style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 95, display: 'flex', alignItems: 'center', gap: 14, padding: '9px 10px 9px 18px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13.5, whiteSpace: 'nowrap' }}>
      <span>{t.text}</span>{t.undo ? <button onClick={() => { const f = t.undo; setT(null); f?.(); }} style={{ height: 28, padding: '0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>Undo</button> : <span style={{ width: 8 }} />}
    </div>
  );
  return { say: (text: string, undo?: () => void) => setT({ text, undo }), node };
}

/** The design's confirm dialog: a serif title, a sentence, Cancel and a red action. */
export function ConfirmDialog({ title, sub, cta, onGo, onClose }: { title: string; sub: string; cta: string; onGo: () => void; onClose: () => void }) {
  return (
    <Modal title={title} sub={sub} width={480} onClose={onClose} foot={<><span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn" style={{ background: 'var(--danger)', color: '#0d0d0d', fontWeight: 500 }} onClick={onGo}>{cta}</button></>}>
      <span />
    </Modal>
  );
}

/** What to do with the photographs when a shoot is deleted: keep them (in no shoot) or remove them too. */
export function DeleteShootDialog({ title, count, onKeep, onDelete, onClose }: { title: string; count: number; onKeep: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Modal title={title} sub={`The shoot goes either way. What about its ${count} ${count === 1 ? 'photograph' : 'photographs'}?`} width={520} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><span className="grow" /><button className="btn outline" onClick={onKeep}>Keep the photographs</button><button className="btn" style={{ background: 'var(--danger)', color: '#0d0d0d', fontWeight: 500 }} onClick={onDelete}>Delete shoot and photographs</button></>}>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>Kept photographs stay in Frames with their ratings and tags, in no shoot, and show up in To do until you put them in one. Deleted photographs move to Recently removed for 30 days. Original files are never touched.</p>
    </Modal>
  );
}

/** Photographs as rows of equal height, each as wide as its shape asks (the design's grid). */
export function JustifiedGrid({ photos, selecting, picked, onClick, due }: { photos: PhotoLite[]; selecting: boolean; picked: Set<number>; onClick: (p: PhotoLite) => void; due: (p: PhotoLite) => boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {photos.map((p) => {
        const on = picked.has(p.id), ar = p.ar || 1.5;
        return (
          <button key={p.id} onClick={() => onClick(p)} aria-label={p.title || p.file} aria-pressed={selecting ? on : undefined} style={{ position: 'relative', flex: `${ar.toFixed(3)} 1 ${Math.round(ar * 190)}px`, aspectRatio: String(ar), borderRadius: 4, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)`, outline: on ? '2px solid var(--text)' : 'none', outlineOffset: -2 }}>
            {selecting && <b style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: '50%', background: on ? '#efede8' : 'rgba(0,0,0,.35)', boxShadow: 'inset 0 0 0 2px #efede8', color: '#0d0d0d', fontSize: 12, lineHeight: '22px', textAlign: 'center', fontWeight: 500 }}>{on ? '✓' : ''}</b>}
            {due(p) && <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 11, background: 'rgba(0,0,0,.62)', padding: '2px 7px', borderRadius: 999, color: '#efede8' }}>Due</span>}
          </button>
        );
      })}
      <i style={{ flex: '20 1 0' }} />
    </div>
  );
}

export const isDue = (p: PhotoLite) => !!p.nextReviewAt && p.nextReviewAt <= new Date().toISOString();

/**
 * The floating bar over a selection: how many, Clear, Move to shoot…, Remove (or Protected when every one is in a protected shoot), Add to composition.
 * Moving and removing are done here; the page reloads through onChanged.
 */
export function PickedBar({ ids, photos, shoots, onClear, onChanged, say }: { ids: number[]; photos: PhotoLite[]; shoots: Shoot[]; onClear: () => void; onChanged: () => void; say: (t: string, undo?: () => void) => void }) {
  const { refreshSummary } = useStore();
  const [dlg, setDlg] = useState<null | 'move' | 'comp' | 'remove'>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  if (ids.length === 0) return null;
  const protectedIds = new Set(shoots.filter((s) => s.protected).map((s) => s.id));
  const picked = photos.filter((p) => ids.includes(p.id));
  const blocked = picked.filter((p) => protectedIds.has(p.shootId));
  const removable = picked.filter((p) => !protectedIds.has(p.shootId)).map((p) => p.id);
  const allBlocked = picked.length > 0 && blocked.length === picked.length;
  const orphan = async () => { try { await api('/photos/orphan', { body: { photoIds: ids } }); setDlg(null); onClear(); onChanged(); say(`Took ${ids.length} out of their shoots`); } catch (e) { setErr((e as Error).message); } };
  const create = async () => { const name = q.trim(); if (!name) return; try { const made = await api<Shoot>('/shoots', { body: { name, photoIds: ids } }); setDlg(null); setQ(''); onClear(); onChanged(); say(`Moved ${ids.length} to “${made.name}”`); } catch (e) { setErr((e as Error).message); } };
  const move = async (to: Shoot) => { try { await api(`/shoots/${to.id}/move`, { body: { photoIds: ids } }); setDlg(null); onClear(); onChanged(); say(`Moved ${ids.length} to “${to.name}”`); } catch (e) { setErr((e as Error).message); } };
  const remove = async () => { try { await api('/photos/remove', { body: { ids: removable, originals: 'keep' } }); setDlg(null); onClear(); onChanged(); refreshSummary(); say(`Moved ${removable.length} to Recently removed${blocked.length ? ` · ${blocked.length} protected, kept` : ''}`); } catch (e) { setErr((e as Error).message); setDlg(null); } };
  const pill = { height: 40, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)' } as const;
  return (
    <>
      <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96, zIndex: 25, display: 'flex', gap: 8, alignItems: 'center', background: 'var(--raised2)', borderRadius: 999, padding: '8px 8px 8px 24px', boxShadow: 'var(--float)', fontSize: 14, whiteSpace: 'nowrap' }}>
        <b style={{ fontWeight: 500, marginRight: 4 }}>{ids.length} selected</b>
        <button onClick={onClear} style={{ height: 32, padding: '0 12px', color: 'var(--text2)' }}>Clear</button>
        <button onClick={() => { setErr(''); setDlg('move'); }} style={pill}>Move to shoot…</button>
        <button onClick={() => { if (allBlocked) say('These photos are in a protected shoot. Turn off protection to remove them.'); else setDlg('remove'); }} title={blocked.length ? `${blocked.length} selected photo${blocked.length > 1 ? 's are' : ' is'} in a protected shoot and can’t be removed` : 'Move to Recently removed'} style={{ ...pill, color: allBlocked ? 'var(--faint)' : 'var(--danger)', boxShadow: allBlocked ? 'inset 0 0 0 1px var(--hair)' : 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 60%, transparent)' }}>{allBlocked ? 'Protected' : blocked.length ? `Remove ${removable.length}` : 'Remove'}</button>
        <button onClick={() => setDlg('comp')} style={{ height: 40, padding: '0 20px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500 }}>Add to composition</button>
      </div>
      {err && <div role="alert" className="reason" style={{ position: 'fixed', bottom: 150, left: '50%', transform: 'translateX(-50%)', zIndex: 26 }}>{err}</div>}
      {dlg === 'move' && (
        <Modal title="Move to shoot" sub={`${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'}. They are kept; a shoot emptied by the move is removed.`} width={480} onClose={() => setDlg(null)}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} placeholder="Find a shoot, or type a name for a new one" aria-label="Shoot name" className="field-in" style={{ width: '100%', marginBottom: 8 }} />
          {err && <div role="alert" className="reason">{err}</div>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {q.trim() && <button onClick={create} style={{ display: 'flex', alignItems: 'center', minHeight: 44, borderTop: '1px solid var(--hair)', textAlign: 'left', fontWeight: 500 }}>Create “{q.trim()}” and move</button>}
            {picked.some((p) => !p.orphaned) && <button onClick={orphan} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, borderTop: '1px solid var(--hair)', textAlign: 'left' }}><span style={{ flex: 1, color: 'var(--text2)' }}>No shoot (take out of its shoot)</span></button>}
            {shoots.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())).map((s) => <button key={s.id} onClick={() => move(s)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, borderTop: '1px solid var(--hair)', textAlign: 'left' }}><span style={{ flex: 1 }}>{s.name}</span><span style={{ font: `400 12px ${mono}`, color: 'var(--faint)' }}>{s.count}</span></button>)}
          </div>
        </Modal>
      )}
      {dlg === 'comp' && <CompPicker ids={ids} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); onClear(); say(m); }} />}
      {dlg === 'remove' && <ConfirmDialog title={`Remove ${removable.length} ${removable.length === 1 ? 'photograph' : 'photographs'}?`} sub="They move to Recently removed, where you can restore them. The original files are kept." cta="Remove" onGo={remove} onClose={() => setDlg(null)} />}
    </>
  );
}

export function useShoots() { return useApi<Shoot[]>('/shoots'); }

export const Section = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>{children}</div>;
