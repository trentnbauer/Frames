import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { RATINGS, fmtDate, type PhotoFull, type PhotoLite } from '../data';
import { Header } from '../components/Shell';
import ProtoMore from '../proto/ProtoMore';

type Group = { suggestedParentId: number; photos: PhotoLite[] };
const BASE = { isStats: false, isTodo: false, isNew: false, isWelcome: false };

/** Compare (design: Proto More, page "compare"): two photographs side by side, to choose between them. */
export function Compare() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const r = useApi<{ a: PhotoFull; b: PhotoFull; similarity: number }>(`/compare?a=${sp.get('a')}&b=${sp.get('b')}`);
  if (!r.data) return <div className="page-shell"><Header />{r.error && <p role="alert" className="muted">Something went wrong: {r.error}</p>}</div>;
  const { a, b, similarity } = r.data;
  const rows: [string, (p: PhotoFull) => string][] = [
    ['Average rating', (p) => (p.reviewCount ? `${p.avgRating.toFixed(1)} ${RATINGS[Math.round(p.avgRating) - 1].emoji} (${p.reviewCount})` : 'Not reviewed')],
    ['Pixels', (p) => (p.w ? `${p.w} × ${p.h}` : '–')],
    ['Captured', (p) => fmtDate(p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }) || '–'],
    ['Camera', (p) => p.camera || '–'],
    ['Exposure', (p) => p.exposure || '–'],
    ['Subjects', (p) => p.tags.filter((t) => t.kind === 'subject' && t.accepted).map((t) => t.name).join(', ') || '–'],
    ['Tags', (p) => p.tags.filter((t) => t.kind === 'tag' && t.accepted).map((t) => t.name).join(', ') || '–'],
  ];
  const prefer = async (p: PhotoFull) => { const other = p.id === a.id ? b : a; await api(`/photos/${other.id}`, { method: 'PATCH', body: { archived: true } }); nav(`/photo/${p.id}`); };
  const v = {
    ...BASE, isCompare: true, isDupes: false,
    cmpTitle: a.title || a.file, cmpSim: `${Math.round(similarity * 100)}% alike`, cmpBack: () => nav(`/photo/${a.id}`),
    sides: [a, b].map((p) => ({ src: imgUrl(p.id, 'preview'), ring: 'none', title: p.title || p.file, pal: (p.palette ?? []).slice(0, 5).map((c) => c.hex), btn: 'Prefer this one', btnBg: 'transparent', btnFg: 'var(--text)', pick: () => { if (window.confirm(`Prefer “${p.title || p.file}”? The other is left out of review. It stays in your library.`)) void prefer(p); } })),
    cmpRows: rows.map(([k, f], i) => { const x = f(a), y = f(b); return { k, a: x, b: y, border: i < rows.length - 1 ? '1px solid var(--hair)' : 'none', aFg: x !== y ? 'var(--text)' : 'var(--text2)', bFg: x !== y ? 'var(--text)' : 'var(--text2)' }; }),
  };
  return <div className="page-shell"><Header /><ProtoMore page="compare" v={v} /></div>;
}

/** Near-duplicates (design: Proto More, page "dupes"). Nothing is deleted: link edits and crops as variants, or say they are different. */
export function Duplicates() {
  const nav = useNavigate();
  const d = useApi<Group[]>('/duplicates');
  const act = async (path: string, body: unknown) => { await api(path, { body }); d.reload(); };
  const groups = d.data ?? [];
  const v = {
    ...BASE, isCompare: false, isDupes: true,
    dupeLeft: groups.length,
    dupes: groups.map((g) => ({
      op: 1, open: true, closed: false, status: '', undo: () => undefined,
      photos: g.photos.map((p) => ({ src: imgUrl(p.id, 'thumb'), ring: p.id === g.suggestedParentId ? '0 0 0 2px var(--text)' : 'none', file: p.file, meta: `${p.w} × ${p.h}${p.id === g.suggestedParentId ? ' · largest' : ''}`, go: () => nav(`/photo/${p.id}`) })),
      link: () => act('/duplicates/variants', { parentId: g.suggestedParentId, childIds: g.photos.filter((p) => p.id !== g.suggestedParentId).map((p) => p.id) }),
      diff: () => act('/duplicates/ignore', { photoIds: g.photos.map((p) => p.id) }),
    })),
  };
  return (
    <div className="page-shell">
      <Header />
      <ProtoMore page="dupes" v={v} />
      {d.data?.length === 0 && <div className="empty">No near-duplicates found.</div>}
    </div>
  );
}
