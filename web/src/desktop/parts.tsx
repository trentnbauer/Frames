import { useWheelSize } from '../thumbZoom';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { CompPicker } from '../components/AddToComposition';
import { BulkEdit } from '../components/BulkEdit';
import { WarningIcon } from '../components/WarningIcon';
import { ToastSlot } from '../components/Toast';
import { MoveToShoot } from '../components/MoveToShoot';
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
    <ToastSlot>
      <span>{t.text}</span>{t.undo ? <button onClick={() => { const f = t.undo; setT(null); f?.(); }} style={{ height: 28, padding: '0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>Undo</button> : <span style={{ width: 8 }} />}
    </ToastSlot>
  );
  return { say: (text: string, undo?: () => void) => setT({ text, undo }), node };
}

/** The design's confirm dialog: a serif title, a sentence, Cancel and a red action. */
export function ConfirmDialog({ title, sub, cta, onGo, onClose, thumbs }: { title: string; sub: string; cta: string; onGo: () => void; onClose: () => void; thumbs?: string[] }) {
  return (
    <Modal title={title} sub={sub} width={480} onClose={onClose} foot={<><span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger" onClick={onGo}><WarningIcon />{cta}</button></>}>
      {thumbs && thumbs.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 142, overflowY: 'auto' }}>{thumbs.map((u, i) => <i key={i} style={{ width: 44, height: 44, borderRadius: 2, background: `url(${u}) center/cover var(--surface)` }} />)}</div> : <span />}
    </Modal>
  );
}

/** What to do with the photographs when a shoot is deleted: keep them (in no shoot) or remove them too. */
export function DeleteShootDialog({ title, count, onKeep, onDelete, onClose }: { title: string; count: number; onKeep: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Modal title={title} sub="Either way, your original files aren’t touched. Removed photos go to Recently removed, where you can restore them." width={520} onClose={onClose}
      foot={<div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}><button className="btn outline" style={{ width: '100%', whiteSpace: 'normal', height: 'auto', minHeight: 40, padding: '8px 20px' }} onClick={onKeep}>Delete shoot, keep photos</button><button className="btn danger" style={{ width: '100%', whiteSpace: 'normal', height: 'auto', minHeight: 40, padding: '8px 20px' }} onClick={onDelete}><WarningIcon />Delete shoot, remove photos from Frames</button><button className="btn" style={{ width: '100%' }} onClick={onClose}>Cancel</button></div>}>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>Kept photographs stay in Frames with their ratings and tags, in no shoot, and show up in To do until you put them in one. Deleted photographs move to Recently removed for 30 days. Original files are never touched.</p>
    </Modal>
  );
}

/** Photographs as rows of equal height, each as wide as its shape asks (the design's grid). */
export function JustifiedGrid({ photos, selecting, picked, onClick, due, badge }: { photos: PhotoLite[]; selecting: boolean; picked: Set<number>; onClick: (p: PhotoLite) => void; due: (p: PhotoLite) => boolean; /** Text on each photograph instead of Due (nothing when it returns an empty string). */ badge?: (p: PhotoLite) => string }) {
  const { size, el } = useWheelSize();
  return (
    <div ref={el} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {photos.map((p) => {
        const on = picked.has(p.id), ar = p.ar || 1.5;
        return (
          <button key={p.id} onClick={() => onClick(p)} aria-label={p.title || p.file} aria-pressed={selecting ? on : undefined} style={{ position: 'relative', flex: `${ar.toFixed(3)} 1 ${Math.round(ar * size)}px`, aspectRatio: String(ar), borderRadius: 4, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)`, outline: on ? '2px solid var(--text)' : 'none', outlineOffset: -2 }}>
            {selecting && <b style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: '50%', background: on ? '#efede8' : 'rgba(0,0,0,.35)', boxShadow: 'inset 0 0 0 2px #efede8', color: '#0d0d0d', fontSize: 12, lineHeight: '22px', textAlign: 'center', fontWeight: 500 }}>{on ? '✓' : ''}</b>}
            {(badge ? badge(p) : due(p) && 'Due') && <span style={{ position: 'absolute', left: 6, bottom: 6, maxWidth: 'calc(100% - 12px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, background: 'rgba(0,0,0,.62)', padding: '2px 7px', borderRadius: 999, color: '#efede8' }}>{badge ? badge(p) : 'Due'}</span>}
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
  const { refreshSummary, settings } = useStore();
  const [scanning, setScanning] = useState(false);
  const [dlg, setDlg] = useState<null | 'move' | 'comp' | 'remove' | 'edit'>(null);
  const [err, setErr] = useState('');
  if (ids.length === 0) return null;
  const protectedIds = new Set(shoots.filter((s) => s.protected).map((s) => s.id));
  const picked = photos.filter((p) => ids.includes(p.id));
  const blocked = picked.filter((p) => protectedIds.has(p.shootId));
  const removable = picked.filter((p) => !protectedIds.has(p.shootId)).map((p) => p.id);
  const allBlocked = picked.length > 0 && blocked.length === picked.length;
  const orphan = async () => { try { await api('/photos/orphan', { body: { photoIds: ids } }); setDlg(null); onClear(); onChanged(); say(`Took ${ids.length} out of their shoots`); } catch (e) { setErr((e as Error).message); } };
  const create = async (name: string) => { try { const made = await api<Shoot>('/shoots', { body: { name, photoIds: ids } }); setDlg(null); onClear(); onChanged(); say(`Moved ${ids.length} to “${made.name}”`); } catch (e) { setErr((e as Error).message); } };
  const move = async (to: Shoot) => { try { await api(`/shoots/${to.id}/move`, { body: { photoIds: ids } }); setDlg(null); onClear(); onChanged(); say(`Moved ${ids.length} to “${to.name}”`); } catch (e) { setErr((e as Error).message); } };
  const scan = async () => { setErr(''); setScanning(true); try { await api('/ai/run', { method: 'POST', body: { photoIds: ids } }); say(`Scanning ${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'} with AI`); onClear(); } catch (e) { setErr((e as Error).message); } finally { setScanning(false); } };
  const remove = async () => { try { await api('/photos/remove', { body: { ids: removable, originals: 'keep' } }); setDlg(null); onClear(); onChanged(); refreshSummary(); say(`Moved ${removable.length} to Recently removed${blocked.length ? ` · ${blocked.length} protected, kept` : ''}`); } catch (e) { setErr((e as Error).message); setDlg(null); } };
  const plain = { height: 32, padding: '0 12px', color: 'var(--text)' } as const;
  const pill = { height: 40, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)' } as const;
  return (
    <>
      <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96, zIndex: 25, display: 'flex', gap: 8, alignItems: 'center', background: 'var(--raised2)', borderRadius: 999, padding: '8px 8px 8px 24px', boxShadow: 'var(--float)', fontSize: 14, whiteSpace: 'nowrap' }}>
        <b style={{ fontWeight: 500, marginRight: 4 }}>{ids.length} selected</b>
        <button onClick={onClear} style={{ height: 32, padding: '0 12px', color: 'var(--text2)' }}>Clear</button>
        <i aria-hidden style={{ width: 1, height: 20, background: 'var(--hair)' }} />
        <button onClick={() => { if (allBlocked) say('These photos are in a protected shoot. Turn off protection to remove them.'); else setDlg('remove'); }} disabled={allBlocked} title={blocked.length ? `${blocked.length} selected photo${blocked.length > 1 ? 's are' : ' is'} in a protected shoot and can’t be removed` : 'Move to Recently removed'} style={{ height: 32, padding: '0 12px', color: allBlocked ? 'var(--faint)' : 'var(--danger)' }}>{blocked.length ? `Remove ${removable.length}…` : 'Remove…'}</button>
        <i aria-hidden style={{ width: 1, height: 20, background: 'var(--hair)' }} />
        <button onClick={() => { setErr(''); setDlg('edit'); }} title="Set camera, lens, film, place, date, tags and more on every selected photograph" style={plain}>Edit details…</button>
        <button onClick={() => { setErr(''); setDlg('move'); }} style={plain}>Move to shoot…</button>
        {settings && settings.ai !== 'off' && <button onClick={scan} disabled={scanning} title="Describe and tag the selected photographs with AI" style={plain}>{scanning ? 'Starting…' : <>✦ Scan with AI</>}</button>}
        <button onClick={() => setDlg('comp')} style={{ height: 40, padding: '0 20px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500 }}>Add to composition…</button>
      </div>
      {err && <div role="alert" className="reason" style={{ position: 'fixed', bottom: 150, left: '50%', transform: 'translateX(-50%)', zIndex: 26 }}>{err}</div>}
      {dlg === 'move' && (
        <Modal title={`Move ${ids.length} ${ids.length === 1 ? 'photo' : 'photos'}`} width={560} onClose={() => setDlg(null)}>
          <MoveToShoot count={ids.length} shoots={shoots} canOrphan={picked.some((p) => !p.orphaned)} busy={false} error={err} onAdd={move} onCreate={create} onOrphan={orphan} onClose={() => setDlg(null)} />
        </Modal>
      )}
      {dlg === 'edit' && <BulkEdit ids={ids} onClose={() => setDlg(null)} onDone={onChanged} />}
      {dlg === 'comp' && <CompPicker ids={ids} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); onClear(); say(m); }} />}
      {dlg === 'remove' && <ConfirmDialog title={`Remove ${removable.length} ${removable.length === 1 ? 'photo' : 'photos'}?`} thumbs={picked.filter((p) => removable.includes(p.id)).map((p) => imgUrl(p.id, 'thumb'))} sub="They’re removed from Frames and go to Recently removed, where you can restore them. The original files stay where they are." cta={`Remove ${removable.length} ${removable.length === 1 ? 'photo' : 'photos'}`} onGo={remove} onClose={() => setDlg(null)} />}
    </>
  );
}

export function useShoots() { return useApi<Shoot[]>('/shoots'); }

export const Section = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>{children}</div>;
