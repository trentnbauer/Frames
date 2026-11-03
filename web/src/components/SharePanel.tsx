import { useState } from 'react';
import { api, useApi } from '../api';
import { fmtDate } from '../data';

type ShareLink = {
  id: number; token: string; label: string; allowDownload: boolean; allowReview: boolean; expiresAt: string | null;
  status: 'active' | 'expired' | 'revoked'; views: number; downloads: number; reviews: number;
};
type GuestReviews = { photoId: number; title: string; n: number; avg: number; entries: { reviewer: string; rating: number; note: string | null }[] }[];

const urlOf = (t: string) => `${window.location.origin}/s/${t}`;

/** Make, copy, review and turn off the public links for one collection or photoshoot. */
export function SharePanel({ kind, id, onClose }: { kind: 'collection' | 'shoot'; id: number; onClose: () => void }) {
  const links = useApi<ShareLink[]>(`/shares?kind=${kind}&id=${id}`);
  const [allowDownload, setDownload] = useState(true);
  const [allowReview, setReview] = useState(false);
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

  return (
    <section className="sharepanel" aria-label="Share">
      <div className="spread"><h2 className="serif" style={{ fontSize: 26 }}>Share this {kind === 'shoot' ? 'photoshoot' : 'collection'}</h2><button className="t2" onClick={onClose}>Close</button></div>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 14px', maxWidth: 620 }}>
        Makes a private address that works without a login. Anyone with it sees only these photographs: no places, notes or anything else in your library. They can only do what you tick.
      </p>
      <div className="form" style={{ gap: 18 }}>
        <label className="check"><input type="checkbox" checked={allowDownload} onChange={(e) => setDownload(e.target.checked)} /> Download the original files</label>
        <label className="check"><input type="checkbox" checked={allowReview} onChange={(e) => setReview(e.target.checked)} /> Review and rate them</label>
        <label>Expires <input type="date" aria-label="Expiry date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpires(e.target.value)} /></label>
        <label>Note <input aria-label="Link note" placeholder="Who is this for?" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <button className="pill primary" onClick={create}>Create link</button>
      </div>
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
  );
}
