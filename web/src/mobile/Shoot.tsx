import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { AddPhotosModal } from '../components/AddPhotos';
import { SharePanel } from '../components/SharePanel';
import { Sheet } from '../components/Sheet';
import type { PhotoLite, Shoot } from '../data';
import { reviewUrl } from '../reviewScope';
import { useStore } from '../store';
import { primaryBtn } from './ui';

const glass = { background: 'rgba(30,30,29,.82)', color: '#efede8' } as const;

/** One photoshoot on a phone: a cover collage, its name and stats, Review due, Rename, Protect from deletion, and its photographs. */
export function MobileShoot() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const shoot = useApi<Shoot>(`/shoots/${id}`);
  const list = useApi<{ photos: PhotoLite[] }>(`/photos?shoot=${id}`);
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
  const top = [...photos].sort((a, b) => b.avgRating - a.avgRating || a.id - b.id).slice(0, 3);
  const covers = [s.coverId ?? top[0]?.id, ...top.filter((p) => p.id !== s.coverId).map((p) => p.id)].slice(0, 3);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2600); };
  const protect = async (on: boolean) => { setErr(''); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { protected: on } }); shoot.reload(); say(on ? 'Protected from deletion' : 'Protection turned off'); } catch (e) { setErr((e as Error).message); } };
  const rename = async () => { const v = name.trim(); if (!v) return; try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { name: v } }); setSheet(null); shoot.reload(); } catch (e) { setErr((e as Error).message); } };
  const remove = async (photos: 'orphan' | 'delete') => { try { await api(`/shoots/${s.id}${photos === 'orphan' ? '?photos=orphan' : ''}`, { method: 'DELETE' }); refreshSummary(); nav('/library?view=shoots', { replace: true }); } catch (e) { setSheet(null); setErr((e as Error).message); } };
  const pct = Math.round(s.reviewPct);

  return (
    <div className="ppage flush" data-screen-label="Shoot" style={{ padding: 0 }}>
      <div style={{ height: 250, display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2 }}>
        {[0, 1, 2].map((k) => <div key={k} style={{ gridRow: k === 0 ? '1 / 3' : undefined, background: covers[k] ? `url(${imgUrl(covers[k]!, 'thumb')}) center/cover var(--surface)` : 'var(--surface)' }} />)}
      </div>
      <button onClick={() => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav('/library?view=shoots'); }} style={{ position: 'absolute', top: 52, left: 14, height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, ...glass }}>← Back</button>
      <div style={{ position: 'absolute', top: 52, right: 14, display: 'flex', gap: 6 }}>
        <button onClick={() => setSharing(true)} style={{ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, ...glass }}>Share</button>
        <button onClick={() => setSheet('more')} aria-label="More" style={{ width: 36, height: 36, borderRadius: '50%', fontSize: 15, display: 'grid', placeItems: 'center', ...glass }}>⋯</button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: '400 38px/1 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{s.name}</h1>
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{s.place || 'No place yet'} · {s.dates}</span>
        </div>
        <span style={{ font: '400 11.5px var(--mono)', letterSpacing: '.04em', color: 'var(--faint)' }}>{s.count} PHOTOS · {pct}% REVIEWED · {s.dueCount} DUE</span>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.dueCount > 0 && <button onClick={() => nav(reviewUrl(s.duePhotoIds))} style={{ ...primaryBtn, height: 46, padding: '0 20px', fontSize: 14.5 }}>Review {s.dueCount} due</button>}
          <button onClick={() => { setName(s.name); setErr(''); setSheet('rename'); }} style={{ height: 46, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Rename</button>
          <button onClick={() => setAdding(true)} style={{ height: 46, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Add photos</button>
        </div>
        <button role="switch" aria-checked={!!s.protected} onClick={() => protect(!s.protected)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: s.protected ? 'var(--surface)' : 'transparent', boxShadow: s.protected ? 'inset 0 0 0 1px var(--outline)' : 'inset 0 0 0 1px var(--hair)', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }} aria-hidden><rect x="3.5" y="8" width="11" height="7.5" rx="1.5" /><path d="M6 8V5.8a3 3 0 0 1 6 0V8" /></svg>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Protect from deletion</span><span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--muted)' }}>{s.protected ? 'On · photos can’t be removed and the shoot can’t be deleted' : 'Off · photos here can be removed from Frames'}</span></span>
          <span style={{ position: 'relative', flexShrink: 0, width: 48, height: 28, borderRadius: 999, background: s.protected ? 'var(--btn-bg)' : 'var(--chip)' }}><i style={{ position: 'absolute', top: 3, left: s.protected ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: s.protected ? 'var(--btn-fg)' : 'var(--text2)', transition: 'left .15s' }} /></span>
        </button>
        {(s.tags.length > 0 || s.subjects.length > 0) && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[...s.subjects, ...s.tags].map((t) => <span key={t} style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 12.5 }}>{t}</span>)}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 2, paddingBottom: 40 }}>
        {photos.map((p) => (
          <button key={p.id} onClick={() => nav(`/photo/${p.id}`)} aria-label={p.title || p.file} style={{ position: 'relative', aspectRatio: '1', background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)` }}>
            {!!p.nextReviewAt && p.nextReviewAt <= now && <span style={{ position: 'absolute', left: 6, bottom: 6, height: 18, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: 'rgba(20,20,19,.82)', color: '#efede8', fontSize: 10.5 }}>Due</span>}
          </button>
        ))}
      </div>

      {toast && <div role="status" style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95, maxWidth: 'calc(100vw - 32px)', padding: '9px 16px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13 }}>{toast}</div>}
      {sharing && <SharePanel kind="shoot" id={s.id} name={s.name} onClose={() => setSharing(false)} />}
      {adding && <AddPhotosModal onClose={() => setAdding(false)} onDone={() => { list.reload(); shoot.reload(); }} />}
      {sheet === 'more' && (
        <Sheet title={s.name} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Share…', act: () => { setSheet(null); setSharing(true); } },
              ...(settings && settings.ai !== 'off' ? [{ label: 'Analyse photos with AI', act: async () => { setSheet(null); try { await api('/ai/run', { method: 'POST', body: { shootId: s.id } }); say('AI analysis started'); } catch (e) { setErr((e as Error).message); } } }] : []),
              { label: 'Use the highest rated photograph as the cover', act: async () => { setSheet(null); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { coverId: null } }); shoot.reload(); say('The cover is the highest rated photograph'); } catch (e) { setErr((e as Error).message); } } },
              { label: s.protected ? 'Turn off protection' : 'Protect from deletion', act: () => { setSheet(null); void protect(!s.protected); } },
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
        <Sheet title="Delete this shoot?" sub={`The shoot goes either way. Keep its ${s.count} photographs (they stay in Frames, in no shoot) or delete them with it (they move to Recently removed). Originals are never touched.`} onClose={() => setSheet(null)}>
          <button onClick={() => remove('orphan')} style={{ ...primaryBtn, height: 48 }}>Keep the photographs</button>
          <button onClick={() => remove('delete')} style={{ ...primaryBtn, height: 48, background: 'var(--danger)', color: '#0d0d0d' }}>Delete shoot and photographs</button>
          <button onClick={() => setSheet(null)} style={{ height: 44, fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
        </Sheet>
      )}
    </div>
  );
}
