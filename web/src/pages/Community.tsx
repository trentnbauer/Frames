import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS } from '../data';
import { Header } from '../components/bits';
import { Modal } from '../components/Modal';

type Next = { photo: { token: string; ar: number } | null; written?: boolean; left: number; doneThisSession?: number };
const REASONS: [string, string][] = [['nudity', 'Nudity'], ['violence', 'Violence'], ['harassment', 'Harassment'], ['not-mine-to-share', 'Not theirs to share'], ['other', 'Something else']];

/** Rate other photographers' photos, anonymously both ways. Reports hide a photo from you at once and go to the administrators. */
export function Community() {
  const nav = useNavigate();
  const sum = useApi<{ waiting: number; optIn: boolean }>('/community/summary');
  const [cur, setCur] = useState<Next | null>(null);
  const [loading, setLoading] = useState(true);
  const [rated, setRated] = useState(0);
  const [note, setNote] = useState('');
  const [report, setReport] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const load = async () => { setLoading(true); setNote(''); try { setCur(await api<Next>('/community/next')); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const rate = async (n: number) => {
    if (!cur?.photo) return;
    try { await api('/community/rate', { body: { token: cur.photo.token, rating: n, note } }); setRated((r) => r + 1); await load(); } catch (e) { setErr((e as Error).message); }
  };
  const send = async (reason: string) => {
    if (!cur?.photo) return;
    await api('/community/report', { body: { token: cur.photo.token, reason } }).catch(() => undefined);
    setReport(false); setToast('Reported. You won’t see it again, and an administrator will take a look.'); setTimeout(() => setToast(''), 4000); await load();
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || report) return;
      if (/^[1-5]$/.test(e.key)) rate(Number(e.key));
      if (e.key === 'Escape') nav('/');
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Community review</span>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1, marginTop: 10 }}>Rate other photographers’ work</h1>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 13.5, maxWidth: 560 }}>Anonymous both ways. Photos tagged nudity, violence or adult are never shown, and you only see photos from people who opted in.</p>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{rated} rated this visit{cur?.left ? ` · ${cur.left} waiting` : ''}</span>
      </div>
      {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
      {loading && !cur && <div className="empty">Finding a photo…</div>}
      {!loading && cur && !cur.photo && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 32, maxWidth: 560 }}>
          <h2 className="serif" style={{ fontSize: 30 }}>{rated ? 'That’s all for now.' : 'Nothing to rate right now.'}</h2>
          <p className="t2" style={{ fontSize: 14 }}>{sum.data && !sum.data.optIn ? 'Photos appear here once other people opt in. You can opt in too, so they review yours.' : 'Come back later: new photos from other members show up as they are shared.'}</p>
          <Link to="/settings?section=reviews" className="btn outline">Review settings</Link>
        </div>
      )}
      {cur?.photo && (
        <div className="community-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'center', width: '100%', maxWidth: 1000 }}>
            <img src={`/api/community/image/${cur.photo.token}`} alt="A photograph to rate" style={{ maxWidth: '100%', maxHeight: '58vh', width: 'auto', aspectRatio: String(cur.photo.ar), objectFit: 'contain', borderRadius: 6 }} />
          </div>
          <div className="scale-row" style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
            {RATINGS.map((r) => <button key={r.value} className="ratebtn" onClick={() => rate(r.value)} aria-label={`${r.value} ${r.label}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 38 }}>{r.emoji}</span><span className="mono faint" style={{ fontSize: 11 }}>{r.value}</span></button>)}
          </div>
          {cur.written && <textarea className="field-in" style={{ maxWidth: 520 }} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the photographer (kind and specific)" aria-label="Note" />}
          <button className="muted" style={{ fontSize: 13 }} onClick={() => setReport(true)}>⚑ Report this photo</button>
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
