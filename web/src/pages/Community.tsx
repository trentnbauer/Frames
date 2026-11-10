import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS, ratingMark } from '../data';
import { useStore } from '../store';
import { Header } from '../components/bits';
import { Modal } from '../components/Modal';

type Next = { photo: { token: string; ar: number } | null; meta?: { anon: string; details: string }; written?: boolean; left: number };
type Stats = { reviewed: number; shared: number; received: number; average: number | null };
const REASONS: [string, string][] = [['nudity', 'Nudity'], ['violence', 'Violence'], ['harassment', 'Harassment'], ['not-mine-to-share', 'Not theirs to share'], ['other', 'Something else']];

/** Rate other photographers' photos, anonymously both ways: the photo, "How good is it?", a note, Skip and Next photo, and a Report link. */
export function Community() {
  const nav = useNavigate();
  const { settings } = useStore();
  const stats = useApi<Stats>('/community/stats');
  const [cur, setCur] = useState<Next | null>(null);
  const [loading, setLoading] = useState(true);
  const [rated, setRated] = useState(0);
  const [seen, setSeen] = useState(1);
  const [pick, setPick] = useState(0);
  const [note, setNote] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [report, setReport] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const load = async (skip: string[] = skipped) => {
    setLoading(true); setNote(''); setPick(0);
    try { setCur(await api<Next>(`/community/next${skip.length ? `?skip=${skip.join(',')}` : ''}`)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { void load([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const next = async () => {
    if (!cur?.photo || !pick) return;
    try { await api('/community/rate', { body: { token: cur.photo.token, rating: pick, note } }); setRated((r) => r + 1); setSeen((n) => n + 1); stats.reload(); await load(); } catch (e) { setErr((e as Error).message); }
  };
  const skip = async () => { if (!cur?.photo) return; const sk = [...skipped, cur.photo.token]; setSkipped(sk); setSeen((n) => n + 1); await load(sk); };
  const send = async (reason: string) => {
    if (!cur?.photo) return;
    await api('/community/report', { body: { token: cur.photo.token, reason } }).catch(() => undefined);
    setReport(false); setToast('Reported. You won’t see it again, and an administrator will take a look.'); setTimeout(() => setToast(''), 4000); await load();
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || report) return;
      if (/^[1-5]$/.test(e.key)) setPick(Number(e.key));
      if (e.key === 'Enter' && pick) void next();
      if (e.key === 'Escape') nav('/');
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });
  const d = stats.data;

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1 }}>Community review</h1>
          <span className="muted" style={{ fontSize: 13 }}>{cur?.photo ? `${Math.min(seen, cur.left + seen - 1)} of ${cur.left + seen - 1} today` : 'Nothing waiting'} · {rated} rated</span>
        </div>
        <Link to="/settings?section=reviews" className="muted" style={{ fontSize: 13.5 }}>Share my photos here →</Link>
      </div>
      {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
      {loading && !cur && <div className="empty">Finding a photo…</div>}
      {!loading && cur && !cur.photo && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 32, maxWidth: 560 }}>
          <h2 className="serif" style={{ fontSize: 30 }}>{rated ? 'That’s all for now.' : 'Nothing to rate right now.'}</h2>
          <p className="t2" style={{ fontSize: 14 }}>Photos appear here once other members opt in. You can opt in too, so they review yours.</p>
          <Link to="/settings?section=reviews" className="btn outline">Review settings</Link>
        </div>
      )}
      {cur?.photo && (
        <div className="community-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ background: '#000', borderRadius: 12, display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
              <img src={`/api/community/image/${cur.photo.token}`} alt="A photograph to rate" style={{ maxWidth: '100%', maxHeight: '64vh', objectFit: 'contain' }} />
            </div>
            <div className="faint" style={{ fontSize: 13, marginTop: 12 }}>Photographer {cur.meta?.anon}{cur.meta?.details ? ` · ${cur.meta.details}` : ''}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20 }}>
              <div className="spread" style={{ alignItems: 'baseline', marginBottom: 14 }}><h2 className="serif" style={{ fontSize: 26 }}>How good is it?</h2><span className="faint" style={{ fontSize: 12 }}>Press 1–5</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg)', borderRadius: 12, padding: '14px 12px', marginBottom: 14 }} role="group" aria-label="Rate this photograph">
                {RATINGS.map((r) => <button key={r.value} aria-pressed={pick === r.value} onClick={() => setPick(r.value)} aria-label={`${r.value} ${r.label}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, opacity: pick && pick !== r.value ? 0.45 : 1 }}><span style={{ fontSize: settings?.ratingStyle === 'stars' ? 14 : 26, letterSpacing: '.1em' }}>{ratingMark(r, settings?.ratingStyle)}</span><span className="faint" style={{ fontSize: 11.5 }}>{r.label}</span></button>)}
              </div>
              {cur.written && <input className="field-in" style={{ height: 40, borderRadius: 8, marginBottom: 16 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What works, or what would make it better? (optional)" aria-label="Note" maxLength={500} />}
              <div className="spread" style={{ alignItems: 'center' }}>
                <button className="muted" onClick={skip}>Skip</button>
                <button className="btn primary lg" style={{ opacity: pick ? 1 : 0.5 }} disabled={!pick} onClick={next}>Next photo</button>
              </div>
            </div>
            <button className="muted" style={{ textAlign: 'left', fontSize: 13.5 }} onClick={() => setReport(true)}>⚑ Report this photo</button>
            <div style={{ borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, color: 'var(--text2)' }}>
              <span className="eyebrow">How it works</span>
              <p style={{ margin: 0 }}>You don’t see who took it, and they don’t see who rated it.</p>
              <p style={{ margin: 0 }}>Photos marked nudity, violence or adult content are never shown here.</p>
              <p style={{ margin: 0 }}>Community scores are kept apart from your own ratings and your guests’.</p>
            </div>
            {d && (
              <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px 18px' }}>
                <span className="eyebrow">Your photos in the community</span>
                <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                  {([[d.shared, 'shared'], [d.received, 'ratings received'], [d.average === null ? '–' : d.average.toFixed(1), 'average'], [d.reviewed, 'you’ve reviewed']] as const).map(([v, l]) => <div key={l}><div className="serif" style={{ fontSize: 28, lineHeight: 1 }}>{v}</div><div className="faint" style={{ fontSize: 12 }}>{l}</div></div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {report && (
        <Modal title="Report this photo" sub="It disappears for you straight away. An administrator decides whether it stays." width={440} onClose={() => setReport(false)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>{REASONS.map(([k, l]) => <button key={k} className="mi" onClick={() => send(k)}>{l}</button>)}</div>
        </Modal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
