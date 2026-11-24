import { usePinchColumns } from '../thumbZoom';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { AddPhotosModal } from '../components/AddPhotos';
import { SharePanel } from '../components/SharePanel';
import { Sheet } from '../components/Sheet';
import type { PhotoLite, Shoot } from '../data';
import { reviewUrl } from '../reviewScope';
import { useStore } from '../store';
import { primaryBtn } from './ui';
import { useScrollRestore } from '../useScrollRestore';

/** One photoshoot on a phone: a cover collage, its name and stats, Review due, Rename, Protect from deletion, and its photographs. */
export function MobileShoot() {
  const pinch = usePinchColumns();
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const shoot = useApi<Shoot>(`/shoots/${id}`);
  const list = useApi<{ photos: PhotoLite[] }>(`/photos?shoot=${id}`);
  const box = useRef<HTMLDivElement>(null); // this page scrolls inside its own panel, not the window
  useScrollRestore(!!shoot.data && !!list.data, box);
  const [sheet, setSheet] = useState<null | 'more' | 'rename' | 'delete'>(null);
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const s = shoot.data;
  if (!s) return <div className="ppage" style={{ paddingTop: 80 }}>{shoot.error ? <p role="alert" className="muted">Something went wrong: {shoot.error}</p> : <p className="muted">Loading…</p>}</div>;
  const photos = list.data?.photos ?? [];
  const now = new Date().toISOString();
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2600); };
  const protect = async (on: boolean) => { setErr(''); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { protected: on } }); shoot.reload(); say(on ? 'Protected from deletion' : 'Protection turned off'); } catch (e) { setErr((e as Error).message); } };
  const rename = async () => { const v = name.trim(); if (!v) return; try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { name: v } }); setSheet(null); shoot.reload(); } catch (e) { setErr((e as Error).message); } };
  const remove = async (photos: 'orphan' | 'delete') => { try { await api(`/shoots/${s.id}${photos === 'orphan' ? '?photos=orphan' : ''}`, { method: 'DELETE' }); refreshSummary(); nav('/library?view=shoots', { replace: true }); } catch (e) { setSheet(null); setErr((e as Error).message); } };
  const pct = Math.round(s.reviewPct);

  return (
    <div ref={box} className="ppage flush" data-screen-label="Shoot" style={{ padding: 0 }}>
      <div style={{ padding: 'max(16px, env(safe-area-inset-top)) 16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav('/library?view=shoots'); }} aria-label="Back" style={{ background: 'var(--surface)', borderRadius: '50%', width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 18 }}>←</button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ font: '400 30px/1.05 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{s.name}</h1>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{[s.place, s.dates, `${s.count} ${s.count === 1 ? 'photo' : 'photos'}`, `${pct}% reviewed`].filter(Boolean).join(' · ')}</span>
          </div>
          <button onClick={() => setSheet('more')} aria-label="More" style={{ background: 'var(--surface)', borderRadius: '50%', width: 44, height: 44, flexShrink: 0, fontSize: 18, display: 'grid', placeItems: 'center' }}>⋯</button>
        </div>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          {s.dueCount > 0 && <button onClick={() => nav(reviewUrl(s.duePhotoIds))} style={{ ...primaryBtn, flex: 1, height: 44, fontSize: 14.5 }}>Review {s.dueCount} due</button>}
          <button onClick={() => setSharing(true)} style={{ flex: '0 0 auto', height: 44, padding: '0 30px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Share</button>
        </div>
      </div>
      <div {...pinch.handlers} style={{ display: 'flex', flexWrap: 'wrap', gap: 2, paddingBottom: 130, ...pinch.style }}>
        {photos.map((p) => (
          <button key={p.id} onClick={() => nav(`/photo/${p.id}`)} aria-label={p.title || p.file} style={{ position: 'relative', flex: `${(p.ar || 1).toFixed(3)} 1 calc(${(p.ar || 1).toFixed(3)} * 100vw / ${pinch.cols})`, aspectRatio: String(p.ar || 1), background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)` }}>
            {!!p.nextReviewAt && p.nextReviewAt <= now && <span style={{ position: 'absolute', left: 6, bottom: 6, height: 18, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: 'rgba(20,20,19,.82)', color: '#efede8', fontSize: 10.5 }}>Due</span>}
          </button>
        ))}
      </div>

      {toast && <div role="status" style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95, maxWidth: 'calc(100vw - 32px)', padding: '9px 16px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13 }}>{toast}</div>}
      {sharing && <SharePanel kind="shoot" id={s.id} name={s.name} onClose={() => setSharing(false)} />}
      {adding && <AddPhotosModal onClose={() => setAdding(false)} onDone={() => { list.reload(); shoot.reload(); }} />}
      {sheet === 'more' && (
        <Sheet title={s.name} sub={s.tags.join(' · ') || undefined} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Rename', act: () => { setName(s.name); setErr(''); setSheet('rename'); } },
              { label: 'Add photos', act: () => { setSheet(null); setAdding(true); } },
              { label: s.protected ? 'Turn off protection' : 'Protect from deletion', act: () => { setSheet(null); void protect(!s.protected); } },
              ...(settings && settings.ai !== 'off' ? [{ label: '✦ Scan with AI', act: async () => { setSheet(null); try { await api('/ai/run', { method: 'POST', body: { shootId: s.id } }); say('AI analysis started'); } catch (e) { setErr((e as Error).message); } } }] : []),
              { label: 'Cover: highest rated', act: async () => { setSheet(null); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { coverId: null } }); shoot.reload(); say('The cover is the highest rated photograph'); } catch (e) { setErr((e as Error).message); } } },
              { label: s.private ? 'Turn off private' : 'Make private', meta: s.private ? 'Private' : '', act: async () => { setSheet(null); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { private: !s.private } }); shoot.reload(); say(s.private ? 'No longer private' : 'Private: only an AI on your own network sees these photographs'); } catch (e) { setErr((e as Error).message); } } },
              { label: 'Delete shoot…', fg: s.protected ? 'var(--faint)' : 'var(--danger)', meta: s.protected ? 'Protected' : '', act: () => { if (s.protected) { setSheet(null); say('This shoot is protected. Turn off protection to delete it.'); } else setSheet('delete'); } },
            ].map((r) => <button key={r.label} onClick={r.act} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: '1px solid var(--hair)', textAlign: 'left', color: (r as { fg?: string }).fg }}><span style={{ flex: 1, fontSize: 15 }}>{r.label}</span>{(r as { meta?: string }).meta && <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{(r as { meta?: string }).meta}</span>}</button>)}
          </div>
        </Sheet>
      )}
      {sheet === 'rename' && (
        <Sheet title="Rename shoot" onClose={() => setSheet(null)}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void rename(); }} placeholder="Shoot name" aria-label="Shoot name" maxLength={120} style={{ height: 50, border: 0, outline: 'none', borderRadius: 12, padding: '0 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 16 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setSheet(null)} style={{ height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Cancel</button><button onClick={rename} style={{ ...primaryBtn, height: 46, padding: '0 22px', fontSize: 14.5, opacity: name.trim() ? 1 : 0.4 }}>Save</button></div>
        </Sheet>
      )}
      {sheet === 'delete' && (
        <Sheet title="Delete this shoot?" sub="Either way, your original files aren’t touched. Removed photos go to Recently removed, where you can restore them." onClose={() => setSheet(null)}>
          <button onClick={() => remove('orphan')} style={{ height: 48, borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 15 }}>Delete shoot, keep photos</button>
          <button onClick={() => remove('delete')} style={{ ...primaryBtn, height: 48, background: 'var(--danger)', color: '#0d0d0d' }}>⚠ Delete shoot, remove photos from Frames</button>
          <button onClick={() => setSheet(null)} style={{ height: 44, fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
        </Sheet>
      )}
    </div>
  );
}
