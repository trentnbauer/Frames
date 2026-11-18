import { useEffect, useRef, useState } from 'react';
import { SegSlider } from '../components/SegSlider';
import { RATINGS } from '../data';
import { Mark } from '../components/bits';
import { imgUrl } from '../api';
import { Who } from './ShareMobile';

type P = { id: number; title: string; ar: number; n: number };
type Props = {
  token: string;
  d: { kind?: string; name: string; description: string; allowReview: boolean; allowDownload: boolean; expiresAt: string | null; owner?: string; viewer?: { name: string } | null };
  photos: P[]; reviewer: string; setName: (n: string) => void;
  withName: (then: (name: string) => void) => void;
  dl: { done: number; total: number; ready: boolean } | null; download: () => void; cancelDl: () => void;
};
const serif = "'Instrument Serif',Georgia,serif";
const mono = "'IBM Plex Mono',monospace";

/** A shared photoshoot on a wide screen (the design's guest page): hero, download card, filter tabs, a justified grid, a floating progress bar and a full-screen viewer that rates. */
export function ShareShoot({ token, d, photos, reviewer, setName, withName, dl, download, cancelDl }: Props) {
  const [filter, setFilter] = useState<'all' | 'todo' | 'rated'>('all');
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [look, setLook] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [gname, setGname] = useState(reviewer);
  useEffect(() => { setGname(reviewer); }, [reviewer]);
  const owner = d.owner || 'them';
  const canRate = d.allowReview;
  const rated = photos.filter((p) => ratings[p.id] !== undefined).length;
  const tiles = photos.filter((p) => filter === 'all' || (filter === 'rated' ? ratings[p.id] !== undefined : ratings[p.id] === undefined));
  const days = d.expiresAt ? Math.max(0, Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 86_400_000)) : null;
  const expiry = days === null ? 'This link doesn’t expire' : `Link expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  const post = (path: string, body: object) => (name: string) => fetch(`/api/s/${token}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, reviewer: name }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not save that'); });
  const rate = (photoId: number, rating: number, advance = false) => withName(async (name) => {
    const was = ratings[photoId];
    setRatings((r) => ({ ...r, [photoId]: rating })); setSent(false); setErr('');
    try { await post('review', { photoId, rating })(name); if (advance) setLook((i) => (i !== null && i < photos.length - 1 ? i + 1 : i)); }
    catch (e) { setRatings((r) => { const c = { ...r }; if (was === undefined) delete c[photoId]; else c[photoId] = was; return c; }); setErr((e as Error).message); }
  });
  const ref = useRef({ look, rate });
  ref.current = { look, rate };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const { look: l, rate: r } = ref.current;
      if (l === null || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === 'Escape') setLook(null);
      else if (e.key === 'ArrowLeft') setLook(Math.max(0, l - 1));
      else if (e.key === 'ArrowRight') setLook(Math.min(photos.length - 1, l + 1));
      else if (canRate && /^[1-5]$/.test(e.key)) r(photos[l].id, Number(e.key), true);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [photos, canRate]);
  const send = () => { if (!rated) { setErr('Rate a photograph first.'); return; } withName(() => setSent(true)); };
  const cur = look !== null ? photos[look] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '28px 56px 160px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, font: `italic 400 22px/1 ${serif}` }}><Mark />Frames</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{d.owner ? `Shared by ${d.owner}` : 'Shared with you'}</span>
          </div>
          <Who name={reviewer} />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: '40px 56px', alignItems: 'end', marginBottom: 52 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <span style={{ font: `500 10.5px/1 ${mono}`, letterSpacing: '.08em', color: 'var(--faint)' }}>{d.kind === 'photo' ? 'A PHOTOGRAPH' : `A PHOTOSHOOT · ${photos.length} ${photos.length === 1 ? 'PHOTOGRAPH' : 'PHOTOGRAPHS'}`}</span>
            <h1 style={{ font: `400 76px/.95 ${serif}`, margin: 0, textWrap: 'balance' as never, overflowWrap: 'anywhere' }}>{d.name}</h1>
            {d.description && <p style={{ margin: '4px 0 0', font: `italic 400 24px/1.3 ${serif}`, color: 'var(--text2)', textWrap: 'pretty' as never }}>{d.description}</p>}
            <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text2)', maxWidth: 460, textWrap: 'pretty' as never }}>{canRate ? `Open a photograph to see it full size and give it a rating. ${d.owner ? `${d.owner} sees` : 'They see'} your ratings and your name, never your email.` : 'Open a photograph to see it full size.'}</p>
            <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{expiry}</span>
            {d.allowDownload && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 12, padding: '18px 18px 18px 20px', borderRadius: 14, background: 'var(--surface)' }}>
                <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: 'var(--btn-bg)', color: 'var(--btn-fg)', display: 'grid', placeItems: 'center' }}><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg></span>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ font: `400 26px/1.05 ${serif}` }}>Download all {photos.length}</span><span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--muted)' }}>{dl ? (dl.ready ? `${dl.total} files sent to your downloads.` : `Downloading ${dl.done} of ${dl.total}…`) : `Full-size originals, one file after another. ${d.owner ? `${d.owner} allowed` : 'Downloads are allowed'} on this link.`}</span></div>
                {dl && !dl.ready && <button onClick={cancelDl} style={{ fontSize: 13, color: 'var(--text2)' }}>Cancel</button>}
                <button onClick={download} disabled={!!dl && !dl.ready} style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 24px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15, whiteSpace: 'nowrap' }}>Download originals</button>
              </div>
            )}
          </div>
          {photos[0] && <button onClick={() => setLook(0)} aria-label="Open the cover photograph" style={{ display: 'block', width: '100%', aspectRatio: '1.5', borderRadius: 8, background: `url(${imgUrl(photos[0].id, 'preview', token)}) center/cover var(--surface)` }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid var(--hair)', paddingBottom: 12, marginBottom: 16 }}>
          {canRate ? (
            <div role="tablist" aria-label="Show" style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 999, background: 'var(--surface)' }}><SegSlider />
              {([['all', 'All', photos.length], ['todo', 'To rate', photos.length - rated], ['rated', 'Rated', rated]] as const).map(([k, l, n]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 999, fontSize: 13.5, whiteSpace: 'nowrap', background: filter === k ? 'var(--btn-bg)' : 'transparent', color: filter === k ? 'var(--btn-fg)' : 'var(--text2)' }}>{l}<span style={{ font: `400 11px ${mono}`, color: filter === k ? 'var(--btn-fg)' : 'var(--faint)', opacity: filter === k ? 0.6 : 1 }}>{n}</span></button>
              ))}
            </div>
          ) : <span style={{ font: `400 22px ${serif}` }}>All photographs</span>}
          <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{canRate ? 'Click a photograph to rate it · ← → to browse' : 'Click a photograph to see it full size'}</span>
        </div>
        {err && <div role="alert" className="reason" style={{ marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tiles.map((p) => {
            const r = RATINGS.find((x) => x.value === ratings[p.id]);
            return (
              <button key={p.id} onClick={() => setLook(photos.indexOf(p))} aria-label={p.title} style={{ position: 'relative', flex: `${p.ar} ${p.ar} ${p.ar * 220}px`, aspectRatio: String(p.ar), borderRadius: 4, background: `url(${imgUrl(p.id, 'thumb', token)}) center/cover var(--surface)` }}>
                {r && <span style={{ position: 'absolute', left: 8, bottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px 0 8px', borderRadius: 999, background: 'rgba(0,0,0,.62)', color: '#efede8', fontSize: 12 }}><span style={{ fontSize: 15, lineHeight: 1 }}>{r.emoji}</span>{r.label}</span>}
              </button>
            );
          })}
          <i style={{ flex: '20 1 0' }} />
        </div>
        {tiles.length === 0 && <div style={{ padding: 32, borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontSize: 14 }}>{filter === 'rated' ? 'Nothing rated yet.' : 'All rated. Send them to ' + owner + ' below.'}</div>}
      </div>

      {canRate && cur === null && (
        <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 8px 8px 24px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 14, whiteSpace: 'nowrap' }}>
          <b style={{ fontWeight: 500 }}>{rated} of {photos.length} rated</b>
          <span style={{ width: 120, height: 3, borderRadius: 2, background: 'var(--hair)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round((rated / Math.max(1, photos.length)) * 100)}%`, background: 'var(--text)' }} /></span>
          {!sent ? (
            <>
              {!d.viewer && <input value={gname} onChange={(e) => setGname(e.target.value)} onBlur={() => { if (gname.trim() && gname.trim() !== reviewer) setName(gname.trim()); }} onKeyDown={(e) => { if (e.key === 'Enter') { if (gname.trim()) setName(gname.trim()); send(); } }} placeholder="Your name" aria-label="Your name" style={{ width: 180, height: 40, borderRadius: 999, border: 0, outline: 'none', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', padding: '0 16px', fontSize: 14 }} />}
              <button onClick={() => { if (gname.trim() && gname.trim() !== reviewer && !d.viewer) setName(gname.trim()); send(); }} style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, opacity: rated ? 1 : 0.5 }}>Send to {owner}</button>
            </>
          ) : <span role="status" style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 16px', color: 'var(--ok)' }}>✓ Sent · thanks{reviewer ? `, ${reviewer.split(' ')[0]}` : ''}</span>}
        </div>
      )}

      {cur && look !== null && (
        <div role="dialog" aria-label="Photograph" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#000', color: '#efede8', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <span style={{ position: 'absolute', top: 22, left: 28, font: `italic 400 24px/1 ${serif}` }}>{look + 1} / {photos.length}</span>
            <div role="img" aria-label={cur.title} style={{ position: 'absolute', top: 64, bottom: 48, left: 80, right: 80, background: `url(${imgUrl(cur.id, 'preview', token)}) center/contain no-repeat` }} />
            <button onClick={() => setLook(Math.max(0, look - 1))} aria-label="Previous (←)" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', fontSize: 28, color: '#a8a59f', opacity: look > 0 ? 1 : 0.3 }}>‹</button>
            <button onClick={() => setLook(Math.min(photos.length - 1, look + 1))} aria-label="Next (→)" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', fontSize: 28, color: '#a8a59f', opacity: look < photos.length - 1 ? 1 : 0.3 }}>›</button>
          </div>
          <aside style={{ background: '#111110', boxShadow: 'inset 1px 0 0 rgba(255,255,255,.08)', padding: '22px 24px 28px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span style={{ font: `500 10.5px/1 ${mono}`, letterSpacing: '.08em', color: '#6f6c67', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name.toUpperCase()}</span><button onClick={() => setLook(null)} aria-label="Close (Esc)" style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#8f8c86', flexShrink: 0 }}>✕</button></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ font: `400 34px/1.05 ${serif}`, overflowWrap: 'anywhere' }}>{cur.title}</span></div>
            {canRate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ font: `500 10.5px/1 ${mono}`, letterSpacing: '.08em', color: '#6f6c67', paddingBottom: 6 }}>YOUR RATING</span>
                {RATINGS.map((r) => { const on = ratings[cur.id] === r.value; return (
                  <button key={r.value} onClick={() => rate(cur.id, r.value, true)} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 48, padding: '0 14px', borderRadius: 10, background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#a8a59f', textAlign: 'left' }}>
                    <span style={{ fontSize: 22, lineHeight: 1, width: 28, textAlign: 'center' }}>{r.emoji}</span><span style={{ flex: 1, fontSize: 15 }}>{r.label}</span><span style={{ font: `400 11px ${mono}`, opacity: 0.6 }}>{r.value}</span>
                  </button>); })}
                <span style={{ fontSize: 12, color: '#6f6c67', paddingTop: 6 }}>Press 1–5 to rate and move on · ← → to browse · Esc to close</span>
                {err && <span role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{err}</span>}
              </div>
            )}
            <span style={{ flex: 1 }} />
            {d.allowDownload && <a href={`/api/s/${token}/photos/${cur.id}/original`} download style={{ display: 'grid', placeItems: 'center', height: 44, borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.2)', fontSize: 14, color: '#efede8', textDecoration: 'none' }}>Download original</a>}
          </aside>
        </div>
      )}
    </div>
  );
}
