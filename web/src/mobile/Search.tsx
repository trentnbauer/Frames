import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { GearIcon } from './Gear';
import { setPhotoWalk } from '../photoWalk';
import { Eyebrow } from './ui';

const KEY = 'frames-recent-searches';
const TRIES = ['loved', 'no location', 'unrated', 'due'];
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const save = (l: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 5))); } catch { /* recent searches are only a convenience */ } };

type Gear = { own: { id: number; name: string; type: string }[]; want: { id: number; name: string; type: string }[] };

/** Search on a phone: a full page with recent searches, things to try, and results grouped as Photos, Shoots, Compositions and Gear. */
export function MobileSearch({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(load);
  const [photos, setPhotos] = useState<{ total: number; photos: PhotoLite[] } | null>(null);
  const shoots = useApi<Shoot[]>('/shoots');
  const comps = useApi<Collection[]>('/collections');
  const gear = useApi<Gear>('/gear/items');
  const needle = q.trim().toLowerCase();
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  useEffect(() => {
    if (!needle) { setPhotos(null); return; }
    let live = true;
    const t = window.setTimeout(() => { api<{ total: number; photos: PhotoLite[] }>(`/photos?q=${encodeURIComponent(q.trim())}`).then((r) => { if (live) setPhotos(r); }).catch(() => { if (live) setPhotos({ total: 0, photos: [] }); }); }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, needle]);
  const remember = () => { if (!needle) return; const l = [q.trim(), ...recent.filter((x) => x !== q.trim())]; setRecent(l); save(l); };
  const go = (to: string) => { remember(); onClose(); nav(to); };
  const sh = (shoots.data ?? []).filter((s) => [s.name, s.place, s.dates].join(' ').toLowerCase().includes(needle));
  const cs = (comps.data ?? []).filter((c) => c.name.toLowerCase().includes(needle));
  const gs = [...(gear.data?.own ?? []).map((g) => ({ id: g.id, name: g.name, type: g.type, sub: 'Owned' })), ...(gear.data?.want ?? []).map((g) => ({ id: g.id, name: g.name, type: g.type, sub: 'Wishlist' }))].filter((g) => g.name.toLowerCase().includes(needle));
  const ps = photos?.photos ?? [];
  // Opening a result steps through the results, not the photographs around it.
  useEffect(() => { if (ps.length) setPhotoWalk(ps.map((x) => x.id)); }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps
  const none = !!needle && photos !== null && ps.length + sh.length + cs.length + gs.length === 0;
  const group = (title: string, count: number, rows: { key: string | number; thumb?: string; icon?: ReactNode; label: string; sub: ReactNode; to: string }[], more?: { label: string; to: string }) => rows.length > 0 && (
    <div key={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 4 }}><Eyebrow>{title}</Eyebrow><span style={{ font: '400 11px var(--mono)', color: 'var(--faint)' }}>{count}</span></div>
      {rows.map((r) => (
        <button key={r.key} onClick={() => go(r.to)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, borderTop: '1px solid var(--hair)', textAlign: 'left' }}>
          <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 4, display: 'grid', placeItems: 'center', background: r.thumb ? `url(${r.thumb}) center/cover var(--surface)` : 'var(--surface)' }}>{r.icon}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span><span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span></span>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
      ))}
      {more && <button onClick={() => go(more.to)} style={{ height: 44, borderTop: '1px solid var(--hair)', fontSize: 13.5, color: 'var(--text2)', textAlign: 'left' }}>{more.label}</button>}
    </div>
  );

  return (
    <div className="ppage" role="dialog" aria-label="Search" data-screen-label="Search" style={{ zIndex: 80 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 6px 0 16px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)' }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" aria-hidden><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.4 3.4" /></svg>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') remember(); }} placeholder="Photos, shoots, compositions, gear" aria-label="Search" style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text)', fontSize: 15 }} />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 16 }}>×</button>}
          </div>
          <button onClick={onClose} style={{ height: 46, fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
        </div>
        {!needle && (
          <>
            {recent.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}><Eyebrow>RECENT</Eyebrow><button onClick={() => { setRecent([]); save([]); }} style={{ height: 32, fontSize: 13, color: 'var(--text2)' }}>Clear</button></div>
                {recent.map((r) => (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--hair)' }}>
                    <button onClick={() => setQ(r)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minHeight: 50, textAlign: 'left' }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.4" strokeLinecap="round" aria-hidden><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.2l2 1.3" /></svg><span style={{ fontSize: 15 }}>{r}</span></button>
                    <button onClick={() => { const l = recent.filter((x) => x !== r); setRecent(l); save(l); }} aria-label={`Remove ${r} from recent searches`} style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Eyebrow>TRY</Eyebrow>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[...TRIES, ...(shoots.data ?? []).slice(0, 2).map((s) => s.name)].map((t) => <button key={t} onClick={() => setQ(t)} style={{ height: 34, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13, color: 'var(--text2)' }}>{t}</button>)}</div>
            </div>
          </>
        )}
        {needle && (
          <>
            {group('PHOTOS', photos?.total ?? ps.length, ps.slice(0, 5).map((p) => ({ key: p.id, thumb: imgUrl(p.id, 'thumb'), label: p.title || p.file, sub: [shoots.data?.find((s) => s.id === p.shootId)?.name, p.camera].filter(Boolean).join(' · '), to: `/photo/${p.id}?in=list` })), (photos?.total ?? 0) > 5 ? { label: `See all ${photos!.total} photos`, to: `/library?q=${encodeURIComponent(q.trim())}` } : undefined)}
            {group('SHOOTS', sh.length, sh.slice(0, 5).map((s) => ({ key: s.id, thumb: s.coverId ? imgUrl(s.coverId, 'thumb') : undefined, label: s.name || 'Untitled shoot', sub: `${s.place || 'No place'} · ${s.dates} · ${s.count} photos`, to: `/shoots/${s.id}` })))}
            {group('COMPOSITIONS', cs.length, cs.slice(0, 5).map((c) => ({ key: c.id, thumb: c.photoIds[0] ? imgUrl(c.photoIds[0], 'thumb') : undefined, label: c.name, sub: <><span aria-hidden className={`stage-shape ${c.stage}`} style={{ marginRight: 6 }} />{c.stage.charAt(0).toUpperCase() + c.stage.slice(1)}</>, to: `/collections/${c.id}` })))}
            {group('GEAR', gs.length, gs.slice(0, 5).map((g) => ({ key: `${g.sub}${g.id}`, icon: <GearIcon type={g.type} />, label: g.name, sub: g.sub, to: g.sub === 'Wishlist' ? '/gear?view=wish' : '/gear' })))}
            {none && <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ font: '400 28px/1.1 var(--serif)' }}>Nothing found</span><span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Try a place, a camera, a tag or a shoot name.</span></div>}
          </>
        )}
      </div>
    </div>
  );
}
