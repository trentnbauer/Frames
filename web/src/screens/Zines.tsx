import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { Modal } from '../components/Modal';
import { SegSlider } from '../components/SegSlider';
import { WarningIcon } from '../components/WarningIcon';
import { confirmAction } from '../components/dialogs';
import { useTitle } from '../components/bits';
import type { PhotoLite } from '../data';

type Layout = 'one' | 'two' | 'spread' | 'blank';
type ZinePage = { layout: Layout; photos: (number | null)[] };
type PageSize = 'a5' | 'a6' | 'square';
export type Zine = { id: number; name: string; pageSize: PageSize; margin: number; pages: ZinePage[]; pageCount: number; candidates: number[]; printedCount: number; coverId: number | null; updatedAt: string };
export const PAGE_COUNTS = [8, 16, 24] as const;
type Printed = { layout: Layout | 'left' | 'right'; photos: (number | null)[]; entry: number | null };

const SLOTS: Record<Layout, number> = { one: 1, two: 2, spread: 1, blank: 0 };
const LAYOUTS: [Layout, string][] = [['one', 'One photo'], ['two', 'Two photos'], ['spread', 'Across two pages'], ['blank', 'Blank']];
const SIZES: [PageSize, string, number][] = [['a5', 'A5', 148 / 210], ['a6', 'A6', 105 / 148], ['square', 'Square', 1]];
const serif = "'Instrument Serif',Georgia,serif";

/** The same page flow as the server's printedPages (server/src/zine.ts): the cover alone, spreads on facing pages, padded to `count` (or fours). */
export function printedPages(pages: ZinePage[], count = 0): Printed[] {
  const out: Printed[] = [];
  pages.forEach((p, entry) => {
    if (p.layout === 'spread') {
      if (out.length % 2 === 0) out.push({ layout: 'blank', photos: [], entry: null });
      out.push({ layout: 'left', photos: p.photos, entry }, { layout: 'right', photos: p.photos, entry });
    } else out.push({ layout: p.layout, photos: p.photos, entry });
  });
  while (count ? out.length < count : out.length % 4) out.push({ layout: 'blank', photos: [], entry: null });
  return out;
}

/** The pages made to fill exactly `count` printed pages: pages off the end are dropped, empty one-photo pages added. Their photographs stay candidates. */
export function fitTo(pages: ZinePage[], count: number): ZinePage[] {
  const next = [...pages];
  while (next.length && printedPages(next, 1).length > count) next.pop(); // count 1: no padding, just what the pages take
  while (printedPages(next, 1).length < count) next.push({ layout: 'one', photos: [null] });
  return next;
}

/** Facing pages as the reader sees them: the cover on its own on the right, then pairs, then the back cover on its own. */
export function spreadsOf(printed: Printed[]): [number | null, number | null][] {
  if (!printed.length) return [];
  const rows: [number | null, number | null][] = [[null, 0]];
  for (let i = 1; i < printed.length; i += 2) rows.push([i, i + 1 < printed.length ? i + 1 : null]);
  return rows;
}

const sizeLabel = (s: PageSize) => SIZES.find(([k]) => k === s)?.[1] ?? 'A5';

/** The list of zines, a section of Compositions, with New zine. */
export function ZineList({ heading }: { heading: React.ReactNode }) {
  const nav = useNavigate();
  const list = useApi<Zine[]>('/zines');
  const [err, setErr] = useState('');
  const make = async (pageCount: number) => { try { const z = await api<Zine>('/zines', { body: { name: 'Untitled zine', pageCount } }); nav(`/zines/${z.id}`); } catch (e) { setErr((e as Error).message); } };
  return (
    <section aria-label="Zines">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flex: 1 }}>{heading}<span style={{ fontSize: 13, color: 'var(--muted)' }}>Printable booklets of your photographs</span></div>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>New zine</span>
        <div className="seg" role="group" aria-label="New zine with this many pages"><SegSlider />{PAGE_COUNTS.map((n) => <button key={n} type="button" onClick={() => void make(n)}>{n} pages</button>)}</div>
      </div>
      {err && <p role="alert">{err}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.length === 0 && <p className="muted" style={{ maxWidth: 520, lineHeight: 1.5 }}>No zines yet. Start one here, or select photographs in the Library, choose <b style={{ fontWeight: 500 }}>Add to composition…</b>, then <b style={{ fontWeight: 500 }}>Zine</b>.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
        {list.data?.map((z) => (
          <button key={z.id} onClick={() => nav(`/zines/${z.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            <span style={{ width: '100%', aspectRatio: String(SIZES.find(([k]) => k === z.pageSize)?.[2] ?? 1), background: '#fff', boxShadow: 'inset 0 0 0 1px var(--hair), var(--float)', display: 'grid', placeItems: 'center', padding: `${z.margin}%`, boxSizing: 'border-box' }}>
              {z.coverId != null && <img src={imgUrl(z.coverId, 'thumb')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
            </span>
            <span style={{ font: `400 22px/1.1 ${serif}` }}>{z.name}</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{z.printedCount} pages · {sizeLabel(z.pageSize)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** One zine: its pages as facing spreads, the chosen page's layout and photographs, and the PDF. */
export function ZineEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const loaded = useApi<Zine>(`/zines/${id}`);
  const [z, setZ] = useState<Zine | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ entry: number; slot: number } | null>(null);
  const [adding, setAdding] = useState(false); // the Add candidates picker
  const [over, setOver] = useState<string | null>(null); // the slot a dragged photo is over, as "entry:slot"
  const [err, setErr] = useState('');
  useEffect(() => { if (loaded.data) setZ(loaded.data); }, [loaded.data]);
  useTitle(z?.name ?? 'Zine');
  if (loaded.error) return <div className="page-shell"><p role="alert">{loaded.error}</p></div>;
  if (!z) return <div className="page-shell"><p className="muted">Loading zine…</p></div>;

  // Each change shows at once and is saved; if saving fails, the zine is loaded again so what is shown is what is kept.
  const save = (patch: Partial<Pick<Zine, 'name' | 'pageSize' | 'margin' | 'pages' | 'pageCount' | 'candidates'>>) => {
    setErr(''); setZ({ ...z, ...patch });
    api<Zine>(`/zines/${z.id}`, { method: 'PUT', body: patch }).catch((e: Error) => { setErr(`That change was not saved (${e.message}).`); loaded.reload(); });
  };
  // A zine with a set number of pages keeps exactly that many: a page taken out is made up with an empty one at the end.
  const setPages = (pages: ZinePage[]) => save({ pages: z.pageCount ? fitTo(pages, z.pageCount) : pages });
  const placed = new Map<number, number[]>(); printedPages(z.pages, z.pageCount).forEach((p, i) => p.photos.forEach((id) => { if (id != null && p.layout !== 'right') placed.set(id, [...(placed.get(id) ?? []), i + 1]); }));
  const setCount = async (n: number) => {
    const next = fitTo(z.pages, n), kept = new Set(next.flatMap((p) => p.photos));
    if (z.pages.some((p) => p.photos.some((id) => id != null && !kept.has(id))) && !(await confirmAction(`Make this zine ${n} pages?\n\nPhotos on the pages past ${n} come off them. They stay candidates.`, { confirm: `${n} pages` }))) return;
    save({ pageCount: n, pages: next });
  };
  const put = (at: { entry: number; slot: number }, photoId: number) => {
    const p = z.pages[at.entry]; if (!p) return;
    const pages = z.pages.map((x, i) => (i === at.entry ? { ...p, photos: p.photos.map((y, k) => (k === at.slot ? photoId : y)) } : x));
    save({ pages: z.pageCount ? fitTo(pages, z.pageCount) : pages, ...(z.candidates.includes(photoId) ? {} : { candidates: [...z.candidates, photoId] }) });
    setSel(at.entry);
  };
  const removeCandidate = (photoId: number) => save({ candidates: z.candidates.filter((id) => id !== photoId), pages: z.pages.map((p) => ({ ...p, photos: p.photos.map((id) => (id === photoId ? null : id)) })) });
  const addCandidates = (ids: number[]) => save({ candidates: [...new Set([...z.candidates, ...ids])] });
  const edit = (entry: number, page: ZinePage) => setPages(z.pages.map((p, i) => (i === entry ? page : p)));
  const relayout = (entry: number, layout: Layout) => { const old = z.pages[entry]; edit(entry, { layout, photos: Array.from({ length: SLOTS[layout] }, (_, i) => old.photos[i] ?? null) }); };
  const move = (entry: number, by: -1 | 1) => { const to = entry + by; if (to < 0 || to >= z.pages.length) return; const next = [...z.pages]; [next[entry], next[to]] = [next[to], next[entry]]; setPages(next); setSel(to); };
  const removePage = (entry: number) => { setPages(z.pages.filter((_, i) => i !== entry)); setSel(null); };
  const addPage = () => { setPages([...z.pages, { layout: 'one', photos: [null] }]); setSel(z.pages.length); };
  // Dragging a photo onto another slot swaps the two (onto an empty slot, it moves). The page panel's Change and Move buttons do the same without a mouse.
  const swap = (a: { entry: number; slot: number }, b: { entry: number; slot: number }) => {
    if (a.entry === b.entry && a.slot === b.slot) return;
    const next = z.pages.map((p) => ({ ...p, photos: [...p.photos] }));
    const t = next[a.entry]?.photos[a.slot], u = next[b.entry]?.photos[b.slot];
    if (t === undefined || u === undefined) return;
    next[a.entry].photos[a.slot] = u; next[b.entry].photos[b.slot] = t;
    setPages(next); setSel(b.entry);
  };
  const choose = (photoId: number) => { if (!picking) return; put(picking, photoId); setPicking(null); };
  const removeZine = async () => { if (!(await confirmAction(`Remove “${z.name}”?\n\nThe zine's pages and layout can't be recovered. Your photographs stay in Frames.`, { danger: true, confirm: 'Remove zine' }))) return; try { await api(`/zines/${z.id}`, { method: 'DELETE' }); nav('/collections'); } catch (e) { setErr((e as Error).message); } };

  const printed = printedPages(z.pages, z.pageCount);
  const ratio = SIZES.find(([k]) => k === z.pageSize)?.[2] ?? 148 / 210;
  const pageW = 'min(150px, calc((100vw - 48px) / 2))'; // small enough that a whole zine reads like a contact sheet, with the candidates below
  const selPage = sel != null ? z.pages[sel] : null;
  const pageNos = (entry: number) => printed.flatMap((p, i) => (p.entry === entry ? [i + 1] : []));
  const slot = (entry: number | null, i: number, photoId: number | null, style: CSSProperties, cover = false) => (
    <button key={i} type="button" onClick={(e) => { e.stopPropagation(); if (entry == null) return; setSel(entry); if (entry === sel || !photoId) setPicking({ entry, slot: i }); /* first click chooses the page, the next changes its photo */ }} aria-label={photoId ? `Change photo ${i + 1}` : `Choose photo ${i + 1}`}
      draggable={entry != null && photoId != null} title={photoId ? 'Drag onto another photo to swap them' : undefined}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-frames-slot', JSON.stringify({ entry, slot: i })); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (entry == null || !(e.dataTransfer.types.includes('application/x-frames-slot') || e.dataTransfer.types.includes('application/x-frames-photo'))) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(`${entry}:${i}`); }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); if (entry == null) return; const cand = Number(e.dataTransfer.getData('application/x-frames-photo')); if (cand > 0) { put({ entry, slot: i }, cand); return; } try { const from = JSON.parse(e.dataTransfer.getData('application/x-frames-slot')); if (Number.isInteger(from.entry) && Number.isInteger(from.slot)) swap(from, { entry, slot: i }); } catch { /* not a photo from this zine */ } }}
      style={{ position: 'relative', outline: over === `${entry}:${i}` ? '2px dashed #8f8c86' : 'none', outlineOffset: -4, cursor: photoId ? 'grab' : undefined, display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, overflow: 'hidden', ...(photoId ? {} : { boxShadow: 'inset 0 0 0 1px #c9c6bf', color: '#8f8c86', fontSize: 12 }), ...style }}>
      {photoId ? <img src={imgUrl(photoId, 'thumb')} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: cover ? 'cover' : 'contain', display: 'block' }} /> : '+ Photo'}
    </button>
  );
  const pageBox = (i: number | null, side: 'left' | 'right') => {
    const p = i == null ? null : printed[i];
    const on = p?.entry != null && p.entry === sel;
    const base: CSSProperties = { width: pageW, aspectRatio: String(ratio), position: 'relative', boxSizing: 'border-box' };
    if (!p) return <div style={base} />;
    const label = <span className="mono faint" style={{ position: 'absolute', bottom: -20, [side === 'left' ? 'left' : 'right']: 0, fontSize: 11 }}>{i! + 1}{p.entry == null ? ' · added' : ''}</span>;
    const pad = `${z.margin}%`;
    return (
      <div role={p.entry == null ? undefined : 'button'} tabIndex={p.entry == null ? undefined : 0} aria-label={p.entry == null ? `Page ${i! + 1}, blank` : `Page ${i! + 1}`} aria-pressed={p.entry == null ? undefined : on}
        onClick={() => p.entry != null && setSel(p.entry)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && p.entry != null) { e.preventDefault(); setSel(p.entry); } }}
        style={{ ...base, background: '#fff', padding: pad, display: 'flex', flexDirection: ratio < 1 ? 'column' : 'row', gap: pad, outline: on ? '2px solid var(--text)' : 'none', outlineOffset: 3, boxShadow: p.entry == null ? 'inset 0 0 0 1px #dedbd4' : '0 0 0 1px var(--hair)', cursor: p.entry == null ? 'default' : 'pointer' }}>
        {p.layout === 'one' && slot(p.entry, 0, p.photos[0], { flex: 1 })}
        {p.layout === 'two' && [0, 1].map((k) => slot(p.entry, k, p.photos[k], { flex: 1 }))}
        {label}
      </div>
    );
  };

  return (
    <div className="page-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        <button className="btn outline" onClick={() => nav('/collections')} style={{ paddingInline: 16 }}>← Compositions</button>
        <input aria-label="Zine name" defaultValue={z.name} key={z.id} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== z.name) save({ name: v }); else e.target.value = z.name; }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ font: `400 40px/1.1 ${serif}`, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', flex: '1 1 240px', minWidth: 0 }} />
        <span className="mono faint" style={{ fontSize: 11 }}>{printed.length} pages · {sizeLabel(z.pageSize)}</span>
        <a className="btn primary" href={z.pages.length ? `/api/zines/${z.id}/pdf` : undefined} aria-disabled={!z.pages.length} download>Download PDF</a>
      </div>
      {err && <p role="alert" style={{ marginTop: 0 }}>{err}</p>}
      {/* The page panel comes first in reading order, so on a phone it sits above the pages; on a wide screen it is on the right. */}
      <div style={{ display: 'flex', flexDirection: 'row-reverse', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <aside className="zine-panel" style={{ flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {selPage && sel != null ? (
            <section aria-label="Chosen page" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 16, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--hair)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 style={{ font: `400 24px/1 ${serif}`, margin: 0, flex: 1 }}>{pageNos(sel).length > 1 ? `Pages ${pageNos(sel).join('–')}` : `Page ${pageNos(sel)[0]}`}</h2><button onClick={() => setSel(null)} style={{ fontSize: 13, color: 'var(--text2)', height: 32 }}>Done</button></div>
              <div className="seg" role="group" aria-label="Page layout" style={{ flexWrap: 'wrap', alignSelf: 'stretch' }}><SegSlider />{LAYOUTS.map(([k, label]) => <button key={k} type="button" className={selPage.layout === k ? 'on' : ''} aria-pressed={selPage.layout === k} onClick={() => relayout(sel, k)}>{label}</button>)}</div>
              {selPage.layout === 'spread' && <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>The photo fills both facing pages edge to edge, cropped to fit. If it would start on a right-hand page, a blank page is added before it.</p>}
              {selPage.photos.map((photoId, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {photoId ? <img src={imgUrl(photoId, 'thumb')} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ width: 44, height: 44, borderRadius: 6, boxShadow: 'inset 0 0 0 1px var(--outline)' }} />}
                  <span style={{ flex: 1, fontSize: 14 }}>{selPage.photos.length > 1 ? (i === 0 ? 'First photo' : 'Second photo') : 'Photo'}</span>
                  <button className="btn outline" style={{ height: 32, paddingInline: 14 }} onClick={() => setPicking({ entry: sel, slot: i })}>{photoId ? 'Change' : 'Choose'}</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn outline" style={{ height: 32, paddingInline: 14 }} disabled={sel === 0} onClick={() => move(sel, -1)}>Move earlier</button>
                <button className="btn outline" style={{ height: 32, paddingInline: 14 }} disabled={sel === z.pages.length - 1} onClick={() => move(sel, 1)}>Move later</button>
                <button className="btn" style={{ height: 32, paddingInline: 12, color: 'var(--danger)' }} onClick={() => removePage(sel)}><WarningIcon />Remove page</button>
              </div>
            </section>
          ) : <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Choose a page to set its layout: one photo, two photos, or one photo across two facing pages. Page 1 is the cover.</p>}
          <section aria-label="Zine settings" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="seg" role="group" aria-label="Number of pages"><SegSlider />{PAGE_COUNTS.map((n) => <button key={n} type="button" className={z.pageCount === n ? 'on' : ''} aria-pressed={z.pageCount === n} onClick={() => void setCount(n)}>{n} pages</button>)}</div>
            <div className="seg" role="group" aria-label="Page size"><SegSlider />{SIZES.map(([k, label]) => <button key={k} type="button" className={z.pageSize === k ? 'on' : ''} aria-pressed={z.pageSize === k} onClick={() => save({ pageSize: k })}>{label}</button>)}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--muted)', accentColor: 'var(--text)' }}>Margin
              <input type="range" min={0} max={20} step={1} value={z.margin} onChange={(e) => setZ({ ...z, margin: Number(e.target.value) })} onPointerUp={(e) => save({ margin: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => save({ margin: Number((e.target as HTMLInputElement).value) })} style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 12, width: 32, textAlign: 'right', color: 'var(--text)' }}>{z.margin}%</span>
            </label>
            <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>The PDF has one page per page, at 300 dpi, in reading order. Print it as a booklet from your PDF viewer.</p>
            <button className="btn" style={{ alignSelf: 'flex-start', height: 32, paddingInline: 12, color: 'var(--danger)' }} onClick={() => void removeZine()}><WarningIcon />Remove zine…</button>
          </section>
        </aside>
        <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '44px 28px', alignContent: 'flex-start', justifyContent: 'center', paddingBottom: 24 }} onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          {!z.pages.length && <p className="muted" style={{ width: '100%' }}>No pages yet. Add one, then choose its layout and photographs.</p>}
          {spreadsOf(printed).map(([l, r], row) => {
            const sp = l != null && r != null && printed[l].layout === 'left' && printed[r].layout === 'right' ? printed[l] : null;
            if (sp) {
              const on = sp.entry === sel;
              return (
                <div key={row} role="button" tabIndex={0} aria-label={`Pages ${l! + 1}–${r! + 1}, one photo across both`} aria-pressed={on} onClick={() => setSel(sp.entry)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sp.entry); } }}
                  style={{ position: 'relative', width: `calc(${pageW} * 2)`, aspectRatio: String(ratio * 2), background: '#fff', display: 'flex', outline: on ? '2px solid var(--text)' : 'none', outlineOffset: 3, boxShadow: '0 0 0 1px var(--hair)', cursor: 'pointer' }}>
                  {slot(sp.entry, 0, sp.photos[0], { flex: 1 }, true)}
                  <i aria-hidden style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,.18)' }} />
                  <span className="mono faint" style={{ position: 'absolute', bottom: -20, left: 0, fontSize: 11 }}>{l! + 1}</span>
                  <span className="mono faint" style={{ position: 'absolute', bottom: -20, right: 0, fontSize: 11 }}>{r! + 1}</span>
                </div>
              );
            }
            return <div key={row} style={{ display: 'flex' }}>{pageBox(l, 'left')}{pageBox(r, 'right')}</div>;
          })}
          {!z.pageCount && <button className="btn outline" onClick={addPage}>Add page</button>}
        </div>
      </div>
      <section aria-label="Candidates" style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--hair)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ font: `400 26px/1 ${serif}`, margin: 0 }}>Candidates</h2>
          <span className="mono faint" style={{ fontSize: 11, flex: 1 }}>{z.candidates.length} · drag one onto a page</span>
          <button className="btn outline" style={{ height: 32, paddingInline: 14 }} onClick={() => setAdding(true)}>Add photos…</button>
        </div>
        {!z.candidates.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No candidates yet. Add photos here, or from the Library with Add to composition…, then Zine.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 12 }}>
          {z.candidates.map((id) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={imgUrl(id, 'thumb')} alt="" draggable title="Drag onto a page" onDragStart={(e) => { e.dataTransfer.setData('application/x-frames-photo', String(id)); e.dataTransfer.effectAllowed = 'copy'; }}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'grab', opacity: placed.has(id) ? 0.55 : 1 }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12 }}>
                <span className="faint" style={{ flex: 1 }}>{placed.has(id) ? `p. ${placed.get(id)!.join(', ')}` : 'Not placed'}</span>
                <button type="button" onClick={() => removeCandidate(id)} style={{ color: 'var(--muted)', fontSize: 12 }} aria-label="Remove this candidate">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {picking && <PhotoPicker candidates={z.candidates} onPick={choose} onClose={() => setPicking(null)} />}
      {adding && <PhotoPicker title="Add candidates" multiple onPick={(id) => addCandidates([id])} chosen={z.candidates} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Choose a photograph: the zine's candidates first, then the library, with a search. With `multiple` it stays open, and ticks what is chosen. */
function PhotoPicker({ onPick, onClose, candidates = [], title = 'Choose a photo', multiple = false, chosen = [] }: { onPick: (id: number) => void; onClose: () => void; candidates?: number[]; title?: string; multiple?: boolean; chosen?: number[] }) {
  const [q, setQ] = useState(''), [settled, setSettled] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setSettled(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  const list = useApi<{ photos: PhotoLite[] }>(`/photos${settled ? `?query=${encodeURIComponent(settled)}` : ''}`);
  const photos = list.data?.photos ?? [];
  return (
    <Modal title={title} width={760} onClose={onClose}>
      {candidates.length > 0 && <>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Candidates</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 16 }}>
          {candidates.map((id) => <button key={id} type="button" onClick={() => onPick(id)} aria-label={`Candidate ${id}`} style={{ aspectRatio: '1', background: `url(${imgUrl(id, 'thumb')}) center/cover var(--surface)`, borderRadius: 6 }} />)}
        </div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>All photos</div>
      </>}
      <input className="field-in" autoFocus placeholder="Search titles, places, cameras, tags" aria-label="Search photographs" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 14, maxHeight: '55vh', overflowY: 'auto' }}>
        {list.error && <p role="alert">{list.error}</p>}
        {list.data && !photos.length && <p className="muted">No photographs match.</p>}
        {photos.slice(0, 300).map((p) => { const on = chosen.includes(p.id); return <button key={p.id} type="button" onClick={() => onPick(p.id)} aria-label={p.title || p.file} aria-pressed={multiple ? on : undefined} style={{ position: 'relative', aspectRatio: '1', background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)`, borderRadius: 6, outline: on ? '2px solid var(--text)' : 'none', outlineOffset: -2 }}>{on && <span aria-hidden style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: '50%', background: '#efede8', color: '#0d0d0d', fontSize: 12, display: 'grid', placeItems: 'center' }}>✓</span>}</button>; })}
      </div>
      {photos.length > 300 && <p className="faint" style={{ fontSize: 12 }}>Showing the first 300. Search to narrow them down.</p>}
      {multiple && <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}><button className="btn primary" onClick={onClose}>Done</button></div>}
    </Modal>
  );
}
