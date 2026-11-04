import { useState } from 'react';
import { api, useApi } from '../api';
import { fmtDate } from '../data';

type ShareLink = {
  id: number; token: string; label: string; allowDownload: boolean; allowReview: boolean; expiresAt: string | null;
  status: 'active' | 'expired' | 'revoked'; views: number; downloads: number; reviews: number;
};
type GuestReviews = { photoId: number; title: string; n: number; avg: number; entries: { reviewer: string; rating: number; note: string | null }[] }[];

const urlOf = (t: string) => `${window.location.origin}/s/${t}`;

/** Make, copy, review and turn off the public links for one composition or photoshoot. */
export function SharePanel({ kind, id, onClose }: { kind: 'collection' | 'shoot'; id: number; onClose: () => void }) {
  const links = useApi<ShareLink[]>(`/shares?kind=${kind}&id=${id}`);
  const [allowDownload, setDownload] = useState(false);
  const [allowReview, setReview] = useState(true);
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const results = useApi<GuestReviews>(open ? `/shares/${open}/reviews` : null);

  const create = async () => {
    setErr('');
    try {
      await api('/shares', { body: { kind, id, allowDownload, allowReview, label, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined } });
      setLabel(''); setExpires(''); links.reload();
    } catch (e) { setErr((e as Error).message); }
  };
  const copy = async (l: ShareLink) => {
    try { await navigator.clipboard.writeText(urlOf(l.token)); setCopied(l.id); setTimeout(() => setCopied(null), 2000); }
    catch { window.prompt('Copy this link', urlOf(l.token)); } // clipboard needs https; fall back to a box to copy from
  };
  const off = async (l: ShareLink) => {
    if (confirm('Turn this link off? Anyone using it will lose access straight away.')) { await api(`/shares/${l.id}`, { method: 'DELETE' }); links.reload(); }
  };

  const live = links.data?.find((l) => l.status === 'active');
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 13 } as const;
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <section className="sharepanel" role="dialog" aria-label="Share" style={{ background: '#161615', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)', margin: 0, border: 0 }}>
      <div className="spread"><h2 style={{ font: "400 30px 'Instrument Serif',Georgia,serif", margin: '0 0 6px' }}>Share for review</h2><button className="t2" onClick={onClose}>Close</button></div>
      <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 18px' }}>
        A private link to this {kind === 'shoot' ? 'photoshoot' : 'composition'}. Guests see only the pictures: no places, notes or anything else in your library. Their ratings are kept apart from yours and only feed the ranking.
      </p>
      {live && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#0d0d0d', borderRadius: 999, padding: '10px 16px', font: "400 13px 'IBM Plex Mono',monospace", color: '#a8a59f', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{urlOf(live.token).replace(/^https?:\/\//, '')}</div>
          <button onClick={() => copy(live)} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '10px 18px', fontSize: 14 }}>{copied === live.id ? 'Copied' : 'Copy link'}</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 14 }}>
        <label style={row}><span>Guests can rate</span><input type="checkbox" checked={allowReview} onChange={(e) => setReview(e.target.checked)} aria-label="Review and rate them" /></label>
        <label style={row}><span>Guests can download originals</span><input type="checkbox" checked={allowDownload} onChange={(e) => setDownload(e.target.checked)} aria-label="Download the original files" /></label>
        <label style={row}><span>Expires</span><input type="date" aria-label="Expiry date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpires(e.target.value)} /></label>
        <label style={row}><span>Note</span><input aria-label="Link note" placeholder="Who is this for?" value={label} onChange={(e) => setLabel(e.target.value)} style={{ textAlign: 'right' }} /></label>
        {live && <div style={row}><span>Responses so far</span><span>{live.reviews} {live.reviews === 1 ? 'rating' : 'ratings'}</span></div>}
      </div>
      <button className="pill primary" onClick={create} style={{ marginBottom: 6 }}>{live ? 'Make another link' : 'Create link'}</button>
      {err && <div className="reason" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      {links.data?.length === 0 && <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>No links yet.</p>}
      {links.data?.map((l) => (
        <div key={l.id} className={'sharerow' + (l.status !== 'active' ? ' off' : '')}>
          <div className="spread" style={{ gap: 14 }}>
            <span style={{ minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{urlOf(l.token)}</span>
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                {l.label && <>{l.label} · </>}{[l.allowDownload && 'download', l.allowReview && 'review', !l.allowDownload && !l.allowReview && 'view only'].filter(Boolean).join(' + ')}
                {l.expiresAt && <> · {l.status === 'expired' ? 'expired' : 'expires'} {fmtDate(l.expiresAt, { day: 'numeric', month: 'short', year: 'numeric' })}</>}
                {l.status === 'revoked' && <> · turned off</>} · {l.views} {l.views === 1 ? 'view' : 'views'}{l.allowDownload && <>, {l.downloads} downloads</>}{l.allowReview && <>, {l.reviews} ratings</>}
              </div>
            </span>
            <span style={{ display: 'flex', gap: 14, fontSize: 12.5, flex: 'none' }} className="t2">
              {l.status === 'active' && <button onClick={() => copy(l)}>{copied === l.id ? 'Copied' : 'Copy link'}</button>}
              {l.allowReview && <button onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide ratings' : 'See ratings'}</button>}
              {l.status === 'active' && <button onClick={() => off(l)}>Turn off</button>}
            </span>
          </div>
          {open === l.id && (
            <div className="guestres">
              {results.data?.length === 0 && <span className="muted">No ratings yet.</span>}
              {results.data?.map((r) => (
                <div key={r.photoId} style={{ marginBottom: 8 }}>
                  <b>{r.title}</b> <span className="muted">· {r.avg.toFixed(1)} from {r.n}</span>
                  {r.entries.map((e, i) => <div key={i} className="muted" style={{ fontSize: 12.5 }}>{e.reviewer}: {'★'.repeat(e.rating)}{e.note && <> “{e.note}”</>}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
    </div>
  );
}
