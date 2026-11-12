import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import ProtoCommunity from '../proto/ProtoCommunity';

type Next = { photo: { token: string; ar: number } | null; meta?: { anon: string; details: string }; written?: boolean; left: number; others?: { n: number; avg: number | null } };
type Stats = { reviewed: number; shared: number; received: number; average: number | null };

/** Community review: rate other photographers' photos, anonymous both ways. */
export function Community() {
  const nav = useNavigate();
  const stats = useApi<Stats>('/community/stats');
  const [cur, setCur] = useState<Next | null>(null);
  const [loading, setLoading] = useState(true);
  const [rated, setRated] = useState(0);
  const [seen, setSeen] = useState(1);
  const [skipped, setSkipped] = useState<string[]>([]);
  const load = async (skip: string[] = skipped) => {
    setLoading(true);
    try { setCur(await api<Next>(`/community/next${skip.length ? `?skip=${skip.join(',')}` : ''}`)); } finally { setLoading(false); }
  };
  useEffect(() => { void load([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') nav('/'); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [nav]);
  const d = stats.data;
  const photo = cur?.photo;
  return (
    <div className="page-shell">

      <ProtoCommunity
        loading={loading}
        cur={photo ? { src: `/api/community/image/${photo.token}`, who: `Photographer ${cur?.meta?.anon ?? ''}`, kit: cur?.meta?.details ?? '', where: '' } : null}
        others={cur?.others}
        progress={`${seen} of ${seen - 1 + (cur?.left ?? 0)} today · ${rated} rated`}
        mineStats={[[String(d?.shared ?? 0), 'shared'], [String(d?.received ?? 0), 'ratings received'], [d?.average != null ? d.average.toFixed(1) : '–', 'average'], [String(d?.reviewed ?? 0), 'you’ve reviewed']].map(([v, l]) => ({ v, l }))}
        onRate={async (rating: number, note: string) => { if (!photo) return; await api('/community/rate', { body: { token: photo.token, rating, note } }); setRated((r) => r + 1); setSeen((n) => n + 1); stats.reload(); await load(); }}
        onSkip={async () => { if (!photo) return; const sk = [...skipped, photo.token]; setSkipped(sk); setSeen((n) => n + 1); await load(sk); }}
        onReport={async (reason: string, note: string) => { if (!photo) return; await api('/community/report', { body: { token: photo.token, reason, note } }).catch(() => undefined); await load(); }}
        onRestart={() => { setSkipped([]); setSeen(1); setRated(0); void load([]); }}
      />
    </div>
  );
}
