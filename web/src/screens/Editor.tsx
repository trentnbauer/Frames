import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { arrange, dims, FRAMES, type Print } from '../layout';
import { Header } from '../components/Shell';
import ProtoEditor from '../proto/ProtoEditor';
import { RoomBackground } from '../components/RoomBackground';

type Ranking = { weight: number; guests: number; items: { id: number; mine: number | null; mineN: number; guest: number | null; guestN: number; score: number }[] };
type Link = { id: number; token: string; allowDownload: boolean; allowReview: boolean; allowSuggest: boolean; onlyWall: boolean; askName: boolean; pin: string; expiresAt: string | null; status: string };
type Invite = { email: string; status: 'sent' | 'failed' };
type Sugg = { forId: number; photoId: number; by: string[]; notes: string[] };
type FrameSugg = { printId: number; color: string; by: string[] };
type LayoutSugg = { id: number; by: string; layout: { mode: 'row' | 'grid' | 'feature' | 'free'; prints: Print[] }; note?: string };
type Reviews = { photoId: number; title: string; n: number; avg: number; entries: { reviewer: string; rating: number; note: string | null }[] }[];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const EXPIRY: [string, number | null][] = [['1 week', 7], ['3 weeks', 21], ['3 months', 92], ['Never', null]];
const inDays = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); d.setHours(23, 59, 59, 0); return d.toISOString(); };
const expOf = (iso: string | null) => (!iso ? 'Never' : EXPIRY.filter(([, n]) => n !== null).sort((a, b) => Math.abs((a[1] as number) - (new Date(iso).getTime() - Date.now()) / 864e5) - Math.abs((b[1] as number) - (new Date(iso).getTime() - Date.now()) / 864e5))[0][0]);
const expLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'never');

/** The design's print: centred on the wall in cm, sizes by name, orientation P or L, frame and crop as flat fields. */
export type DPrint = { id: number; x: number; y: number; size: string; or: 'P' | 'L'; photo: number | null; stack?: boolean; photo2?: number | null; framed: boolean; colour: string; frame: string; mat: string; zoom?: number; sx?: number; sy?: number };
export const toDesign = (ps: Print[], origin: { x: number; y: number }): DPrint[] => ps.map((p) => { const [W, H] = dims(p); return { id: p.id, x: Math.round(((p.x + W / 2 - origin.x) / 10) * 10) / 10, y: Math.round(((p.y + H / 2 - origin.y) / 10) * 10) / 10, size: p.size, or: p.orientation === 'portrait' ? 'P' : 'L', photo: p.photoId, stack: p.stack, photo2: p.photoId2, framed: !!p.frame, colour: p.frame ? cap(p.frame.color) : 'Black', frame: p.frame ? p.frame.size : p.size, mat: p.frame && p.frame.size !== p.size ? cap(p.frame.mat) : 'None', zoom: p.crop?.zoom, sx: p.crop?.shiftX, sy: p.crop?.shiftY }; });
export const fromDesign = (ds: DPrint[], orig: Print[], origin: { x: number; y: number }): Print[] => ds.map((d) => {
  const o = orig.find((p) => p.id === d.id);
  const base: Print = { id: d.id, size: d.size, orientation: d.or === 'P' ? 'portrait' : 'landscape', frame: d.framed ? { size: d.frame, mat: (d.mat === 'None' ? o?.frame?.mat ?? 'white' : d.mat.toLowerCase()) as never, color: d.colour.toLowerCase() as never } : null, photoId: d.photo, stack: !!d.stack, photoId2: d.stack ? d.photo2 ?? null : null, x: 0, y: 0 };
  const [W, H] = dims(base);
  const out: Print = { ...base, x: Math.round(d.x * 10 - W / 2 + origin.x), y: Math.round(d.y * 10 - H / 2 + origin.y) };
  if (!d.stack && ((d.zoom && d.zoom > 1) || d.sx || d.sy)) out.crop = { zoom: d.zoom ?? 1, shiftX: d.sx ?? 0, shiftY: d.sy ?? 0 };
  return out;
});
export const centreOf = (ps: Print[]) => { if (!ps.length) return { x: 0, y: 0 }; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of ps) { const [W, H] = dims(p); a = Math.min(a, p.x); b = Math.max(b, p.x + W); c = Math.min(c, p.y); d = Math.max(d, p.y + H); } return { x: (a + b) / 2, y: (c + d) / 2 }; };

/** The composition editor (design: Proto Editor, host). Prints are saved as you place them. */
export function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const coll = useApi<Collection>(`/collections/${id}`);
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const ranking = useApi<Ranking>(`/collections/${id}/ranking`);
  const links = useApi<Link[]>(`/shares?kind=collection&id=${id}`);
  const link = links.data?.find((l) => l.status === 'active') ?? null;
  const inv = useApi<{ invites: Invite[]; canEmail: boolean }>(link ? `/shares/${link.id}/invites` : null);
  const sugg = useApi<{ suggestions: Sugg[] }>(`/collections/${id}/suggestions`);
  const fsugg = useApi<{ suggestions: FrameSugg[] }>(`/collections/${id}/frame-suggestions`);
  const lsugg = useApi<{ suggestions: LayoutSugg[] }>(`/collections/${id}/layout-suggestions`);
  const reviews = useApi<Reviews>(link ? `/shares/${link.id}/reviews` : null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const c = coll.data;
  if (!c || !lib.data) return <div className="page-shell"><Header />{coll.error && <p role="alert" className="muted">Something went wrong: {coll.error}</p>}</div>;

  const layoutPrints = c.layout.mode === 'free' ? c.layout.prints : arrange(c.layout.prints, c.layout.mode);
  if (!origin.current) origin.current = centreOf(layoutPrints);
  const byId = new Map(lib.data.photos.map((p) => [p.id, p]));
  const rk = new Map((ranking.data?.items ?? []).map((r) => [r.id, r]));
  const order = [...c.photoIds].sort((a, b) => (rk.get(b)?.score ?? 0) - (rk.get(a)?.score ?? 0));
  const unrated = order.filter((pid) => !rk.get(pid)?.mineN);
  const ppi = c.layout.ppi;
  const reload = () => { coll.reload(); ranking.reload(); sugg.reload(); fsugg.reload(); lsugg.reload(); links.reload(); };
  const saveLayout = async (ps: Print[]) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: { layout: { mode: 'free', prints: ps, ppi, ...(c.layout.bg ? { bg: c.layout.bg } : {}) } } })); ranking.reload(); };
  const wallOf = (ps: Print[]) => ps.map((p, i) => ({ img: p.photoId ? `url(${imgUrl(p.photoId, 'thumb')}) center/cover` : 'rgba(0,0,0,.18)', frame: p.frame ? FRAMES[p.frame.color] ?? '#151514' : '#e9e7e1', ring: 'none', label: `Print ${i + 1}`, labelFg: 'var(--faint)' }));
  const mark = (w: ReturnType<typeof wallOf>, i: number) => w.map((x, k) => (k === i ? { ...x, ring: '0 0 0 2px var(--surface),0 0 0 4px var(--text)', label: `${x.label} · changed`, labelFg: 'var(--text)' } : x));
  const title = (pid: number) => byId.get(pid)?.title || byId.get(pid)?.file || 'a photo';

  // Guests: what they suggested (a photo, a frame colour, a layout) to approve or deny, and what they rated.
  const changes = [
    ...(sugg.data?.suggestions ?? []).map((g) => {
      const at = layoutPrints.findIndex((p) => p.photoId === g.forId || p.photoId2 === g.forId);
      const mine = wallOf(layoutPrints), theirs = mark(wallOf(layoutPrints.map((p) => ({ ...p, photoId: p.photoId === g.forId ? g.photoId : p.photoId }))), at);
      const clear = () => api(`/collections/${c.id}/suggestions?forId=${g.forId}&photoId=${g.photoId}`, { method: 'DELETE' });
      return { id: `p${g.forId}-${g.photoId}`, initial: (g.by[0] ?? '?')[0].toUpperCase(), who: g.by.join(', '), what: `Print ${at + 1} swapped for “${title(g.photoId)}”${g.notes[0] ? ` · “${g.notes[0]}”` : ''}`, from: `url(${imgUrl(g.forId, 'thumb')}) center/cover`, to: `url(${imgUrl(g.photoId, 'thumb')}) center/cover`, mine, theirs,
        approve: async () => { await clear(); await saveLayout(layoutPrints.map((p) => ({ ...p, photoId: p.photoId === g.forId ? g.photoId : p.photoId, photoId2: p.photoId2 === g.forId ? g.photoId : p.photoId2 }))); reload(); }, deny: async () => { await clear(); reload(); } };
    }),
    ...(fsugg.data?.suggestions ?? []).map((g) => {
      const at = layoutPrints.findIndex((p) => p.id === g.printId);
      const clear = () => api(`/collections/${c.id}/frame-suggestions?printId=${g.printId}&color=${g.color}`, { method: 'DELETE' });
      return { id: `f${g.printId}-${g.color}`, initial: (g.by[0] ?? '?')[0].toUpperCase(), who: g.by.join(', '), what: `Print ${at + 1} · ${g.color} frame`, from: FRAMES[layoutPrints[at]?.frame?.color ?? 'black'] ?? '#151514', to: FRAMES[g.color] ?? '#151514', mine: wallOf(layoutPrints), theirs: mark(wallOf(layoutPrints).map((w, k) => (k === at ? { ...w, frame: FRAMES[g.color] ?? w.frame } : w)), at),
        approve: async () => { await saveLayout(layoutPrints.map((p) => (p.id === g.printId && p.frame ? { ...p, frame: { ...p.frame, color: g.color as never } } : p))); await clear(); reload(); }, deny: async () => { await clear(); reload(); } };
    }),
    ...(lsugg.data?.suggestions ?? []).map((g) => {
      const merged = g.layout.prints.map((p) => { const cur = layoutPrints.find((q) => q.id === p.id); return { ...p, photoId: cur?.photoId ?? null, photoId2: p.stack ? cur?.photoId2 ?? null : null }; });
      const clear = () => api(`/collections/${c.id}/layout-suggestions/${g.id}`, { method: 'DELETE' });
      return { id: `l${g.id}`, initial: g.by[0]?.toUpperCase() ?? '?', who: g.by, what: `Layout · ${g.layout.prints.length} prints${g.note ? ` · “${g.note}”` : ''}`, from: 'rgba(0,0,0,.25)', to: 'rgba(0,0,0,.25)', mine: wallOf(layoutPrints), theirs: wallOf(merged),
        approve: async () => { await saveLayout(merged); await clear(); reload(); }, deny: async () => { await clear(); reload(); } };
    }),
  ];
  const who = new Map<string, { n: number; sum: number }>();
  for (const r of reviews.data ?? []) for (const e of r.entries) { const w = who.get(e.reviewer) ?? { n: 0, sum: 0 }; w.n++; w.sum += e.rating; who.set(e.reviewer, w); }
  const people = [...who.entries()].map(([name, w]) => ({ name, initial: name[0]?.toUpperCase() ?? '?', when: `${w.n} of ${c.photoIds.length}`, pct: c.photoIds.length ? Math.round((w.n / c.photoIds.length) * 100) : 0, avg: (w.sum / w.n).toFixed(1) }));

  const share = {
    active: !!link, url: link ? `${window.location.origin}/s/${link.token}` : '', display: link ? `${window.location.host}/s/${link.token}` : '',
    askName: !!link?.askName, pin: link?.pin ?? '', allowReview: !!link?.allowReview, allowSuggest: !!link?.allowSuggest, allowDownload: !!link?.allowDownload, onlyWall: !!link?.onlyWall,
    expOpt: link ? expOf(link.expiresAt) : '3 weeks', expLabel: link ? expLabel(link.expiresAt) : '', invites: inv.data?.invites ?? [], canEmail: inv.data?.canEmail,
  };
  const patchShare = async (body: object) => { if (link) { await api(`/shares/${link.id}`, { method: 'PATCH', body }); links.reload(); } };

  return (
    <div className="page-shell">
      <Header />
      <ProtoEditor
        roomControl={<RoomBackground id={c.id} bg={c.background} onChanged={coll.reload} onScale={async (mmPerPx) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: { layout: { ...c.layout, bg: { mmPerPx } } } })); }} />}
        roomImage={c.background ? { url: `/api/collections/${c.id}/background?v=${c.background.v}`, w: c.background.w * (c.layout.bg?.mmPerPx ?? Math.max(3300 / c.background.w, 1800 / c.background.h)) / 10, h: c.background.h * (c.layout.bg?.mmPerPx ?? Math.max(3300 / c.background.w, 1800 / c.background.h)) / 10 } : null}
        name={c.name} printsKey={JSON.stringify(c.layout.prints)} prints={toDesign(layoutPrints, origin.current)}
        onPrints={(ds: DPrint[]) => saveLayout(fromDesign(ds, layoutPrints, origin.current!))}
        photoMeta={(pid: number) => [title(pid), '', rk.get(pid)?.score ?? 0]} photoDims={(pid: number) => { const p = byId.get(pid); return [p?.w ?? 6000, p?.h ?? 4000]; }} photoUrl={(pid: number) => imgUrl(pid, 'preview')} photoThumb={(pid: number) => imgUrl(pid, 'thumb')}
        onRemoveCandidate={async (pid: number) => { const used = layoutPrints.some((p) => p.photoId === pid || (p.stack && p.photoId2 === pid)); if (used && !window.confirm('Remove this photo from the composition, including the prints holding it? It stays in your library.')) return; await api(`/collections/${c.id}/photos/${pid}`, { method: 'DELETE' }); reload(); }}
        order={order} unrated={unrated}
        share={share} onShareStart={async (d?: { allowReview: boolean; allowSuggest: boolean; allowDownload: boolean; onlyWall: boolean; askName: boolean; pin: string; expOpt: string }) => { const n = d ? EXPIRY.find((e) => e[0] === d.expOpt)?.[1] : undefined; await api('/shares', { body: { kind: 'collection', id: c.id, allowReview: d?.allowReview ?? true, allowSuggest: d?.allowSuggest ?? true, allowDownload: d?.allowDownload, onlyWall: d?.onlyWall ?? false, askName: d?.askName, ...(d?.pin ? { pin: d.pin } : {}), ...(d ? { expiresAt: n == null ? null : inDays(n) } : {}) } }); links.reload(); }}
        onShareStop={async () => { if (link) { await api(`/shares/${link.id}`, { method: 'DELETE' }); links.reload(); } }}
        onShareRegen={async () => { if (link) { await api(`/shares/${link.id}/regenerate`, { body: {} }); links.reload(); } }}
        onSharePatch={patchShare} onShareExpiry={(l: string) => { const n = EXPIRY.find((e) => e[0] === l)?.[1]; return patchShare({ expiresAt: n == null ? null : inDays(n) }); }}
        onInvite={async (email: string) => { if (link) { await api(`/shares/${link.id}/invites`, { body: { emails: [email] } }); inv.reload(); } }}
        onRemoveInvite={async (email: string) => { if (link) { await api(`/shares/${link.id}/invites?email=${encodeURIComponent(email)}`, { method: 'DELETE' }); inv.reload(); } }}
        guests={{ changes, people }}
        onDelete={async () => { await api(`/collections/${c.id}`, { method: 'DELETE' }); nav('/collections'); }}
        onExport={async () => { const ids = layoutPrints.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null); const pad = String(ids.length).length; for (let i = 0; i < ids.length; i++) { const a = document.createElement('a'); a.href = `/api/photos/${ids[i]}/original?n=${i + 1}&pad=${pad}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); await new Promise((r) => setTimeout(r, 450)); } }}
      />
    </div>
  );
}
