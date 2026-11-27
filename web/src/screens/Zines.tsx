import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadOriginals, imgUrl, useApi } from '../api';
import { Modal } from '../components/Modal';
import { SegSlider } from '../components/SegSlider';
import { WarningIcon } from '../components/WarningIcon';
import { confirmAction } from '../components/dialogs';
import { useTitle } from '../components/bits';
import { EditableCompositionName } from '../components/EditableCompositionName';
import { CompositionStage, type CompositionStageName } from '../components/CompositionStage';
import { WallButton } from '../components/WallButton';
import { ToastSlot } from '../components/Toast';
import { usePhoneWidth } from '../usePhoneWidth';
import type { PhotoLite } from '../data';

type Layout = 'one' | 'two' | 'three' | 'spread' | 'blank';
export type PageText = { on: boolean; body: string; pos: 'top' | 'middle' | 'bottom'; font: 'serif' | 'mono' };
/** Three photos: two portraits side by side with a landscape below, or the landscape on top. */
export type Arrange = 'portraits-top' | 'landscape-top';
type ZinePage = { layout: Layout; photos: (number | null)[]; text?: PageText; arrange?: Arrange };
type PageSize = 'a3-fold' | 'a4-fold' | 'a5' | 'a6' | 'square' | '4:5' | '3:4' | '1:1' | 'pocket';
type Kind = 'zine' | 'carousel' | 'notebook';
export type Zine = { id: number; kind: Kind; colour: string; name: string; pageSize: PageSize; margin: number; pages: ZinePage[]; pageCount: number; candidates: number[]; printedCount: number; coverId: number | null; stage: CompositionStageName; createdAt?: string; updatedAt: string };
export const PAGE_COUNTS = [8, 16, 24] as const;
// The demo has no server to render the PDF or slides.
const DEMO = import.meta.env.VITE_FRAMES_DEMO === 'true';
type Printed = { layout: Layout | 'left' | 'right' | 'note' | 'photo'; photos: (number | null)[]; entry: number | null };

const SLOTS: Record<Layout, number> = { one: 1, two: 2, three: 3, spread: 1, blank: 0 };
const LAYOUTS: [Layout, string][] = [['one', 'One photo'], ['two', 'Two photos'], ['three', 'Three photos'], ['spread', 'Across two pages'], ['blank', 'Blank']];
// The sheet a zine is printed on, folded into 8 pages (A3 makes A6 pages, A4 makes A7). A5, A6 and Square are for zines made before, one page per PDF page.
const SHEETS: [PageSize, string, string][] = [['a4-fold', 'A4 sheet', '8 × A7 pages'], ['a3-fold', 'A3 sheet', '8 × A6 pages']];
const SIZES: [PageSize, string, number][] = [['a3-fold', 'A3 sheet', 105 / 148.5], ['a4-fold', 'A4 sheet', 74.25 / 105], ['a5', 'A5', 148 / 210], ['a6', 'A6', 105 / 148], ['square', 'Square', 1], ['4:5', '4:5', 4 / 5], ['3:4', '3:4', 3 / 4], ['1:1', '1:1', 1], ['pocket', 'Pocket', 90 / 140]];
// A notebook's paper: each photograph on a right-hand page, its number and note facing it.
const NOTEBOOK_SIZES: [PageSize, string, string][] = [['pocket', 'Pocket', '90 × 140 mm'], ['a6', 'A6', '105 × 148 mm'], ['a5', 'A5', '148 × 210 mm']];
// A carousel's slide shapes, at Instagram's 1080 px width, and the colours round its photographs and pages.
const SHAPES: [PageSize, string][] = [['4:5', '1080 × 1350'], ['3:4', '1080 × 1440'], ['1:1', '1080 × 1080']];
const COLOURS: [string, string][] = [['ffffff', 'White'], ['000000', 'Black'], ['efede8', 'Paper']];
const MAX_SLIDES = 20;
const MAX_PAGES = 100; // the server's limit on laid-out pages
const VISIBLE_SLIDES = 3; // a carousel shows one row of slides on the wall; the arrows step one slide at a time
const DEFAULT_TEXT: PageText = { on: false, body: '', pos: 'bottom', font: 'serif' };
const serif = "'Instrument Serif',Georgia,serif", mono = "'IBM Plex Mono',monospace";
const eyebrow: CSSProperties = { font: `500 11px ${mono}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' };
const pill: CSSProperties = { height: 32, paddingInline: 14 };

/** Two photographs on a page of this width over height: one above the other, or side by side, whichever shows more of them (as the server's pairBoxes). */
export function stackPair(a: number, b: number, ratio: number, marginPct: number): boolean {
  const W = ratio, H = 1, m = (W * marginPct) / 100;
  const area = (cw: number, ch: number) => [a, b].reduce((n, ar) => { const w = Math.min(cw, ch * ar); return n + w * (w / ar); }, 0);
  return area(W - 2 * m, (H - 3 * m) / 2) >= area((W - 3 * m) / 2, H - 2 * m);
}
export const isSheet = (s: PageSize) => s === 'a3-fold' || s === 'a4-fold';

/** The same page flow as the server's printedPages (server/src/zine.ts): the cover alone, spreads on facing pages, padded to `count` (or fours). */
export function printedPages(pages: ZinePage[], count = 0, kind: Kind = 'zine'): Printed[] {
  const out: Printed[] = [];
  pages.forEach((p, entry) => {
    if (kind === 'notebook') out.push({ layout: 'note', photos: [], entry }, { layout: 'photo', photos: p.photos.slice(0, 1), entry });
    else if (p.layout === 'spread') {
      if (kind === 'zine' && out.length % 2 === 0) out.push({ layout: 'blank', photos: [], entry: null }); // a carousel's spread starts on any slide
      out.push({ layout: 'left', photos: p.photos, entry }, { layout: 'right', photos: p.photos, entry });
    } else out.push({ layout: p.layout, photos: p.photos, entry });
  });
  while (kind === 'zine' && (count ? out.length < count : out.length % 4)) out.push({ layout: 'blank', photos: [], entry: null });
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

/** Fill in order: each empty slot takes the next unplaced candidate; a carousel then adds a slide a photo, up to 20, and a notebook a page a photo. */
export function fillInOrder(pages: ZinePage[], candidates: number[], kind: Kind): { pages: ZinePage[]; placed: number } {
  const used = new Set(pages.flatMap((p) => p.photos).filter((id): id is number => id != null));
  const queue = candidates.filter((id) => !used.has(id));
  let placed = 0;
  const next = pages.map((p) => ({ ...p, photos: p.photos.map((id) => (id == null && queue.length ? (placed++, queue.shift()!) : id)) }));
  if (kind === 'notebook') while (queue.length && next.length < MAX_PAGES) { next.push({ layout: 'one', photos: [queue.shift()!] }); placed++; }
  if (kind === 'carousel') while (queue.length && printedPages(next, 0, kind).length < MAX_SLIDES) { next.push({ layout: 'one', photos: [queue.shift()!] }); placed++; }
  return { pages: next, placed };
}

const sizeLabel = (s: PageSize) => SIZES.find(([k]) => k === s)?.[1] ?? 'A5';
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The zines, carousels or notebooks, as a section of Compositions, with New. */
/** Zines or carousels. With `stage`, `find` or `order` (the Compositions bar), only those that match, in that order, and no heading row. */
export function ZineList({ heading, kind = 'zine', stage, find = '', order }: { heading?: React.ReactNode; kind?: Kind; stage?: CompositionStageName; find?: string; order?: (a: Zine, b: Zine) => number }) {
  const nav = useNavigate();
  const list = useApi<Zine[]>('/zines');
  const [err, setErr] = useState('');
  const carousel = kind === 'carousel', what = kind;
  const make = async () => { try { const z = await api<Zine>('/zines', { body: { kind } }); nav(`/zines/${z.id}`); } catch (e) { setErr((e as Error).message); } };
  const ofKind = list.data?.filter((z) => (z.kind ?? 'zine') === kind);
  const needle = find.trim().toLowerCase();
  const mine = ofKind?.filter((z) => (!stage || (z.stage ?? 'progress') === stage) && (!needle || z.name.toLowerCase().includes(needle)));
  if (order) mine?.sort(order);
  return (
    <section aria-label={`${cap(kind)}s`}>
      {heading && <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flex: 1 }}>{heading}<span style={{ fontSize: 13, color: 'var(--muted)' }}>{carousel ? 'Instagram carousels of your photographs' : kind === 'notebook' ? 'A photograph a page, with a note facing it' : 'Printable booklets of your photographs'}</span></div>
        <button className="btn outline" onClick={() => void make()}>New {what}</button>
      </div>}
      {err && <p role="alert">{err}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {ofKind?.length === 0 && <p className="muted" style={{ maxWidth: 520, lineHeight: 1.5 }}>No {what}s yet. Start one here, or select photographs in the Library, choose <b style={{ fontWeight: 500 }}>Add to composition…</b>, then <b style={{ fontWeight: 500 }}>{carousel ? 'Instagram carousel' : cap(kind)}</b>.</p>}
      {!!ofKind?.length && mine?.length === 0 && <p className="muted">No {what}s here. Try another stage or search.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
        {mine?.map((z) => (
          <button key={z.id} onClick={() => nav(`/zines/${z.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            <span style={{ width: '100%', aspectRatio: String(SIZES.find(([k]) => k === z.pageSize)?.[2] ?? 1), background: `#${z.colour ?? 'ffffff'}`, boxShadow: 'inset 0 0 0 1px var(--hair), var(--float)', display: 'grid', placeItems: 'center', padding: `${z.margin}%`, boxSizing: 'border-box' }}>
              {z.coverId != null && <img src={imgUrl(z.coverId, 'thumb')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
            </span>
            <span style={{ font: `400 22px/1.1 ${serif}` }}>{z.name}</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{z.printedCount} {carousel ? 'slides' : 'pages'} · {sizeLabel(z.pageSize)}{z.stage && z.stage !== 'progress' ? ` · ${cap(z.stage)}` : ''}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** One zine or carousel, in the composition editor's shell: wall + side panel, Progress · Review · Done, candidates below. */
export function ZineEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const phone = usePhoneWidth();
  const loaded = useApi<Zine>(`/zines/${id}`);
  const [z, setZ] = useState<Zine | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ entry: number; slot: number } | null>(null);
  const [adding, setAdding] = useState(false); // the Add candidates picker
  const [ars, setArs] = useState<Record<number, number>>({}); // each placed photograph's width over height, from its thumbnail
  const [names, setNames] = useState<Record<number, string>>({}); // file names of the chosen page's photographs, as the panel shows them
  const [over, setOver] = useState<string | null>(null); // the slot a dragged photo is over, as "entry:slot"
  const [off, setOff] = useState(0); // the first carousel slide shown on the wall
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => { if (loaded.data) setZ(loaded.data); }, [loaded.data]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const shown = (sel != null ? z?.pages[sel]?.photos ?? [] : []).filter((pid): pid is number => pid != null && !(pid in names));
  useEffect(() => {
    for (const pid of shown) api<PhotoLite>(`/photos/${pid}`).then((p) => setNames((n) => ({ ...n, [pid]: p.title || p.file.replace(/^.*\//, '').replace(/\.[^.]+$/, '') }))).catch(() => setNames((n) => ({ ...n, [pid]: 'Photo' })));
  }, [shown.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useTitle(z?.name ?? '');
  if (loaded.error) return <div className="page-shell"><p role="alert">{loaded.error}</p></div>;
  if (!z) return <div className="page-shell"><p className="muted">Loading…</p></div>;

  // A carousel is laid out like a zine, slides for pages: no cover, no facing pages, at most 20, and a zip of JPEGs instead of a PDF.
  // A notebook is a page pair an entry: the photograph on the right, its number and note on the left. It is numbered by entry, as its pages are.
  const carousel = z.kind === 'carousel', notebook = z.kind === 'notebook', zine = z.kind === 'zine', word = carousel ? 'slide' : 'page', Word = carousel ? 'Slide' : 'Page';
  const What = cap(z.kind);
  const readOnly = z.stage === 'done';
  const flash = (text: string, undo?: () => void) => { window.clearTimeout(toastTimer.current); setToast({ text, undo }); toastTimer.current = window.setTimeout(() => setToast(null), 7000); };

  // Each change shows at once and is saved; if saving fails, the zine is loaded again so what is shown is what is kept.
  const save = (patch: Partial<Pick<Zine, 'name' | 'pageSize' | 'margin' | 'colour' | 'pages' | 'pageCount' | 'candidates' | 'stage'>>) => {
    setZ((cur) => (cur ? { ...cur, ...patch } : cur));
    // A failure is said in the one toast, so nothing on the page moves when it appears or goes.
    return api<Zine>(`/zines/${z.id}`, { method: 'PUT', body: patch }).catch((e: Error) => { flash(`That change was not saved. ${e.message}`); loaded.reload(); });
  };
  // A zine with a set number of pages keeps exactly that many: a page taken out is made up with an empty one at the end.
  const setPages = (pages: ZinePage[]) => save({ pages: z.pageCount ? fitTo(pages, z.pageCount) : pages });
  const printed = printedPages(z.pages, z.pageCount, z.kind);
  // Where each photograph is: "3", or "4–5" for one across two pages, once per place it is used.
  const placed = new Map<number, string[]>();
  const noOf = (p: Printed, i: number) => (notebook && p.entry != null ? p.entry + 1 : i + 1);
  printed.forEach((p, i) => p.photos.forEach((pid) => { if (pid != null && p.layout !== 'right') placed.set(pid, [...(placed.get(pid) ?? []), p.layout === 'left' ? `${i + 1}–${i + 2}` : String(noOf(p, i))]); }));
  const whereLabel = (at: string[]) => `${Word}${at.length > 1 || at[0].includes('–') ? 's' : ''} ${at.join(', ')}`;
  const unplaced = z.candidates.filter((c) => !placed.has(c)).length;
  const emptySlots = printed.reduce((n, p) => n + (p.layout === 'right' ? 0 : p.photos.filter((x) => x == null).length), 0);
  const fullCarousel = carousel && printed.length >= MAX_SLIDES;

  const setSheet = async (k: PageSize) => {
    const next = fitTo(z.pages, 8), kept = new Set(next.flatMap((p) => p.photos));
    if (z.pages.some((p) => p.photos.some((pid) => pid != null && !kept.has(pid))) && !(await confirmAction(`Print on one sheet?\n\nA zine folded from one sheet has 8 pages. Photos on the pages past 8 come off them; they stay candidates.`, { confirm: 'Print on one sheet' }))) return;
    save({ pageSize: k, pageCount: 8, pages: next });
  };
  const setCount = async (n: number) => {
    const next = fitTo(z.pages, n), kept = new Set(next.flatMap((p) => p.photos));
    if (z.pages.some((p) => p.photos.some((pid) => pid != null && !kept.has(pid))) && !(await confirmAction(`Make this zine ${n} pages?\n\nPhotos on the pages past ${n} come off them. They stay candidates.`, { confirm: `${n} pages` }))) return;
    save({ pageCount: n, pages: next });
  };
  const put = (at: { entry: number; slot: number }, photoId: number) => {
    const p = z.pages[at.entry]; if (!p) return;
    const pages = z.pages.map((x, i) => (i === at.entry ? { ...p, photos: p.photos.map((y, k) => (k === at.slot ? photoId : y)) } : x));
    save({ pages: z.pageCount ? fitTo(pages, z.pageCount) : pages, ...(z.candidates.includes(photoId) ? {} : { candidates: [...z.candidates, photoId] }) });
    setSel(at.entry);
  };
  const removeCandidate = (photoId: number) => save({ candidates: z.candidates.filter((c) => c !== photoId), pages: z.pages.map((p) => ({ ...p, photos: p.photos.map((c) => (c === photoId ? null : c)) })) });
  const addCandidates = (ids: number[]) => save({ candidates: [...new Set([...z.candidates, ...ids])] });
  const edit = (entry: number, patch: Partial<ZinePage>) => setPages(z.pages.map((p, i) => (i === entry ? { ...p, ...patch } : p)));
  // Changing layout keeps the page's text and as many of its photos as fit.
  const relayout = (entry: number, layout: Layout) => { const old = z.pages[entry]; edit(entry, { layout, photos: Array.from({ length: SLOTS[layout] }, (_, i) => old.photos[i] ?? null) }); };
  const move = (entry: number, by: -1 | 1) => { const to = entry + by; if (to < 0 || to >= z.pages.length) return; const next = [...z.pages]; [next[entry], next[to]] = [next[to], next[entry]]; setPages(next); setSel(to); };
  const removePage = (entry: number, title: string) => {
    const prev = z.pages;
    setPages(prev.filter((_, i) => i !== entry)); setSel(null);
    flash(`${title} removed`, () => { setPages(prev); setSel(entry); setToast(null); });
  };
  const addSlide = () => { setPages([...z.pages, { layout: 'one', photos: [null] }]); setSel(z.pages.length); if (carousel) setOff(Math.max(0, printed.length + 1 - (phone ? 1 : VISIBLE_SLIDES))); };
  const fill = () => {
    const r = fillInOrder(z.pages, z.candidates, z.kind);
    if (!r.placed) { flash('Every candidate is already placed.'); return; }
    const prev = z.pages;
    setPages(r.pages);
    flash(`${r.placed} photo${r.placed > 1 ? 's' : ''} placed in order`, () => { setPages(prev); setToast(null); });
  };
  // Dragging a photo onto another slot swaps the two (onto an empty slot, it moves). The panel's Change and Earlier/Later buttons do the same without a mouse.
  const swap = (a: { entry: number; slot: number }, b: { entry: number; slot: number }) => {
    if (a.entry === b.entry && a.slot === b.slot) return;
    const next = z.pages.map((p) => ({ ...p, photos: [...p.photos] }));
    const t = next[a.entry]?.photos[a.slot], u = next[b.entry]?.photos[b.slot];
    if (t === undefined || u === undefined) return;
    next[a.entry].photos[a.slot] = u; next[b.entry].photos[b.slot] = t;
    setPages(next); setSel(b.entry);
  };
  const choose = (photoId: number) => { if (!picking) return; put(picking, photoId); setPicking(null); };
  const removeZine = async () => { if (!(await confirmAction(`Remove “${z.name}”?\n\nIts ${printed.length} ${word}s and layout can't be recovered. Your photographs stay in Frames.`, { danger: true, confirm: `Remove ${z.kind}` }))) return; try { await api(`/zines/${z.id}`, { method: 'DELETE' }); nav('/collections'); } catch (e) { flash((e as Error).message); } };
  const setStage = async (stage: CompositionStageName) => { try { const next = await api<Zine>(`/zines/${z.id}`, { method: 'PUT', body: { stage } }); setZ(next); if (stage === 'done') setSel(null); } catch (e) { flash((e as Error).message); } };

  const paper = `#${z.colour}`, dark = z.colour === '000000';
  const ratio = SIZES.find(([k]) => k === z.pageSize)?.[2] ?? 148 / 210;
  const m = z.margin, pad = `${m}%`;
  const selPage = !readOnly && sel != null ? z.pages[sel] ?? null : null;
  const pageNos = (entry: number) => (notebook ? [entry + 1] : printed.flatMap((p, i) => (p.entry === entry ? [i + 1] : [])));
  const nos = sel != null ? pageNos(sel) : [];
  const selTitle = nos.length > 1 ? `${Word}s ${nos[0]}–${nos[nos.length - 1]}` : `${Word} ${nos[0] ?? ''}`;
  const emptyRing = dark ? 'inset 0 0 0 1px rgba(255,255,255,.28)' : 'inset 0 0 0 1px #c9c6bf', emptyFg = dark ? 'rgba(255,255,255,.55)' : '#8f8c86';

  const slot = (entry: number | null, i: number, photoId: number | null, style: CSSProperties, img?: (src: string) => ReactNode) => (
    <button key={i} type="button" disabled={readOnly && !photoId} aria-label={photoId ? `Change photo ${i + 1}` : `Choose photo ${i + 1}`}
      onClick={(e) => { e.stopPropagation(); if (entry == null || readOnly) return; setSel(entry); if (entry === sel || !photoId) setPicking({ entry, slot: i }); }}
      draggable={!readOnly && entry != null && photoId != null} title={!readOnly && photoId ? 'Drag onto another photo to swap them' : undefined}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-frames-slot', JSON.stringify({ entry, slot: i })); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (readOnly || entry == null || !(e.dataTransfer.types.includes('application/x-frames-slot') || e.dataTransfer.types.includes('application/x-frames-photo'))) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(`${entry}:${i}`); }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); if (readOnly || entry == null) return; const cand = Number(e.dataTransfer.getData('application/x-frames-photo')); if (cand > 0) { put({ entry, slot: i }, cand); return; } try { const from = JSON.parse(e.dataTransfer.getData('application/x-frames-slot')); if (Number.isInteger(from.entry) && Number.isInteger(from.slot)) swap(from, { entry, slot: i }); } catch { /* not a photo from this zine */ } }}
      style={{ position: 'relative', outline: over === `${entry}:${i}` ? `2px dashed ${emptyFg}` : 'none', outlineOffset: -4, cursor: readOnly ? 'default' : photoId ? 'grab' : 'pointer', display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, overflow: 'hidden', ...(photoId ? {} : { boxShadow: emptyRing, color: emptyFg, fontSize: 11 }), ...style }}>
      {photoId ? (img ? img(imgUrl(photoId, 'thumb')) : <img src={imgUrl(photoId, 'thumb')} alt="" onLoad={(e) => { const im = e.currentTarget; if (!ars[photoId] && im.naturalHeight) setArs((a) => ({ ...a, [photoId]: im.naturalWidth / im.naturalHeight })); }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />) : '+ Photo'}
    </button>
  );

  // Text sits on a page (on a spread, on its left page). Over a photo it gets a band of the paper colour so it stays readable.
  const textOverlay = (p: Printed) => {
    if (!zine || p.entry == null || p.layout === 'right') return null;
    const src = z.pages[p.entry], t = src?.text;
    if (!t?.on || !t.body.trim()) return null;
    const isSerif = t.font !== 'mono', onPhoto = src.photos.some((x) => x != null);
    return (
      <div aria-hidden style={{ position: 'absolute', inset: 0, padding: '9% 8%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: t.pos === 'top' ? 'flex-start' : t.pos === 'middle' ? 'center' : 'flex-end', pointerEvents: 'none' }}>
        <span style={{ maxWidth: '100%', padding: onPhoto ? '.25em .5em' : 0, background: onPhoto ? paper : 'transparent', color: dark ? '#fff' : '#1a1a1a', fontFamily: isSerif ? serif : mono, fontSize: isSerif ? '12cqw' : '5.2cqw', lineHeight: 1.1, letterSpacing: isSerif ? 0 : '.06em', textTransform: isSerif ? 'none' : 'uppercase', textAlign: 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textWrap: 'balance' } as CSSProperties}>{t.body}</span>
      </div>
    );
  };

  const pageBox = (p: Printed, i: number) => {
    const on = !readOnly && p.entry != null && p.entry === sel;
    let body: ReactNode = null, dir: CSSProperties['flexDirection'] = 'row', wrap: CSSProperties['flexWrap'] = 'nowrap', padding = pad;
    if (p.layout === 'one') body = slot(p.entry, 0, p.photos[0], { flex: 1 });
    // A notebook's photo page turns a landscape photograph a quarter clockwise to fill the portrait page, as the PDF does.
    if (p.layout === 'photo') { const pid = p.photos[0], turn = pid != null && (ars[pid] ?? 0) > 1; body = slot(p.entry, 0, pid, { flex: 1, containerType: 'size' }, (src) => <img src={src} alt="" onLoad={(e) => { const im = e.currentTarget; if (pid != null && !ars[pid] && im.naturalHeight) setArs((a) => ({ ...a, [pid]: im.naturalWidth / im.naturalHeight })); }} style={{ position: 'absolute', top: '50%', left: '50%', width: turn ? '100cqh' : '100%', height: turn ? '100cqw' : '100%', transform: `translate(-50%,-50%)${turn ? ' rotate(90deg)' : ''}`, objectFit: 'contain', maxWidth: 'none', display: 'block' }} />); }
    if (p.layout === 'note' && p.entry != null && z.pages[p.entry]?.text?.on !== false) {
      // As the PDF draws it (server/src/zine.ts noteLayer): the number big at the top left, the note small at the bottom left.
      const t = z.pages[p.entry]?.text, isSerif = t?.font !== 'mono';
      body = (
        <div aria-hidden style={{ position: 'absolute', inset: 0, padding: '10%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: dark ? '#fff' : '#1a1a1a', pointerEvents: 'none' }}>
          <span style={{ font: `700 13cqw/1 ${mono}`, letterSpacing: '.08em' }}>{String(p.entry + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: isSerif ? serif : mono, fontSize: isSerif ? '5cqw' : '3.6cqw', lineHeight: 1.3, textTransform: isSerif ? 'none' : 'uppercase', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t?.body ?? ''}</span>
        </div>
      );
    }
    if (p.layout === 'two') { dir = stackPair(ars[p.photos[0] ?? -1] ?? 1, ars[p.photos[1] ?? -1] ?? 1, ratio, m) ? 'column' : 'row'; body = [0, 1].map((k) => slot(p.entry, k, p.photos[k], { flex: 1 })); }
    if (p.layout === 'three') {
      wrap = 'wrap';
      const top = (p.entry != null && z.pages[p.entry]?.arrange) === 'landscape-top';
      const portraits = [0, 1].map((k) => slot(p.entry, k, p.photos[k], { flex: '1 1 40%' })), land = slot(p.entry, 2, p.photos[2], { flex: '1 1 100%' });
      body = top ? [land, ...portraits] : [...portraits, land];
    }
    // A spread keeps the outer margin; only the fold is borderless, so home printers don't clip it.
    if (p.layout === 'left' || p.layout === 'right') {
      const L = p.layout === 'left';
      padding = L ? `${m}% 0 ${m}% ${m}%` : `${m}% ${m}% ${m}% 0`;
      body = slot(p.entry, 0, p.photos[0], { flex: 1, ...(p.photos[0] ? {} : L ? {} : { boxShadow: 'none' }) }, (src) => <img src={src} alt="" style={{ position: 'absolute', top: 0, height: '100%', width: '200%', left: L ? 0 : '-100%', objectFit: 'cover', maxWidth: 'none' }} />);
    }
    const n = i + 1;
    let label = p.layout === 'left' ? `${n}–${n + 1}` : p.layout === 'right' || p.layout === 'note' ? '' : String(noOf(p, i));
    if (zine && n === 1) label = '1 · Cover';
    if (zine && n === printed.length) label = `${n} · Back`;
    if (p.entry == null) label = `${n} · blank`;
    return { label, on, node: (
      <div role={p.entry == null ? undefined : 'button'} tabIndex={p.entry == null || readOnly ? undefined : 0} aria-label={p.entry == null ? `${Word} ${n}, blank` : notebook ? `${Word} ${noOf(p, i)}, ${p.layout === 'note' ? 'note' : 'photo'}` : `${Word} ${n}`} aria-pressed={p.entry == null ? undefined : on}
        onClick={(e) => { e.stopPropagation(); if (p.entry != null && !readOnly) setSel(p.entry); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && p.entry != null && !readOnly) { e.preventDefault(); setSel(p.entry); } }}
        style={{ position: 'relative', containerType: 'inline-size', aspectRatio: String(ratio), background: paper, padding, boxSizing: 'border-box', display: 'flex', flexDirection: dir, flexWrap: wrap, gap: pad, boxShadow: carousel ? '0 0 0 1px var(--outline)' : '0 0 0 1px var(--hair)', outline: on ? '2px solid var(--text)' : 'none', outlineOffset: 3, cursor: p.entry == null || readOnly ? 'default' : 'pointer' } as CSSProperties}>
        {body}
        {textOverlay(p)}
      </div>
    ) };
  };
  const cell = (p: Printed, i: number, place: CSSProperties, align: 'left' | 'right') => {
    const b = pageBox(p, i);
    return (
      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, ...place }}>
        {b.node}
        <span className="mono" style={{ fontSize: 11, color: b.on ? 'var(--text)' : 'var(--faint)', textAlign: align, minHeight: 14 }}>{b.label}</span>
      </div>
    );
  };

  // Zine: book order, two spreads a row — the cover alone on the right, then 2–3, 4–5 … and the back cover alone on the left.
  const zineGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr)) 40px repeat(2,minmax(0,1fr))', gap: '44px 0', width: '100%', maxWidth: 760, margin: '0 auto' }}>
      {printed.map((p, i) => { const k = i + 1, ci = k % 4; return cell(p, i, { gridColumn: String([1, 2, 4, 5][ci]), gridRow: String(Math.floor(k / 4) + 1) }, ci % 2 ? 'right' : 'left'); })}
    </div>
  );
  // Notebook: one entry a row, the note page on the left and the photograph on the right, as the open notebook shows them.
  const notebookGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '44px 0', width: '100%', maxWidth: phone ? 520 : 600, margin: '0 auto' }}>
      {printed.map((p, i) => cell(p, i, {}, p.layout === 'note' ? 'left' : 'right'))}
    </div>
  );
  // Carousel: one row of slides, stepped one slide at a time.
  // A phone shows one slide at a time: three would each be a thumbnail too small to work on.
  const visible = phone ? 1 : VISIBLE_SLIDES;
  const maxOff = Math.max(0, printed.length - visible), first = Math.min(off, maxOff);
  const arrow = (dir: -1 | 1) => {
    const can = dir < 0 ? first > 0 : first < maxOff;
    return <button type="button" aria-label={dir < 0 ? 'Previous slide' : 'Next slide'} disabled={!can} onClick={(e) => { e.stopPropagation(); setOff(Math.max(0, Math.min(maxOff, first + dir))); }}
      style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--wall-control-bg)', color: 'var(--text)', boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 18, opacity: can ? 1 : 0.35 }}>{dir < 0 ? '←' : '→'}</button>;
  };
  const carouselRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      {arrow(-1)}
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${visible},minmax(0,1fr))`, gap: '36px 20px' }}>
        {printed.slice(first, first + visible).map((p, k) => cell(p, first + k, {}, 'left'))}
      </div>
      {arrow(1)}
    </div>
  );

  const swatches = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {COLOURS.map(([c, n]) => <button key={c} type="button" title={n} aria-label={`${n} border`} aria-pressed={z.colour === c} onClick={() => save({ colour: c })} style={{ width: 24, height: 24, borderRadius: '50%', background: `#${c}`, boxShadow: z.colour === c ? '0 0 0 2px var(--surface),0 0 0 3.5px var(--text)' : 'inset 0 0 0 1px var(--outline)' }} />)}
    </div>
  );
  const borderWidth = (label: string) => (
    <label style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 40px', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--text2)', accentColor: 'var(--text)' }}>{label}
      <input type="range" min={0} max={20} step={1} value={m} onChange={(e) => setZ({ ...z, margin: Number(e.target.value) })} onPointerUp={(e) => save({ margin: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => save({ margin: Number((e.target as HTMLInputElement).value) })} style={{ minWidth: 0 }} />
      <span className="mono" style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--text)' }}>{m}%</span>
    </label>
  );
  const settingsNote = carousel ? `Download saves a zip of JPEGs, 1080 px wide, in order. A carousel holds ${MAX_SLIDES} slides.`
    : notebook ? 'Download saves the original of each photograph, numbered in page order. The files are not changed.'
    : isSheet(z.pageSize) ? `The PDF is one ${z.pageSize === 'a3-fold' ? 'A3' : 'A4'} sheet with the 8 pages placed for folding. Spreads keep the outer margin, so home printers won’t clip them.`
    : 'The PDF has one page per page, at 300 dpi, in reading order. Print it as a booklet from your PDF viewer.';

  const layoutNote = !selPage ? '' : fullCarousel && selPage.layout !== 'spread' ? `Full at ${MAX_SLIDES} slides. Remove a slide to make room for one across two.`
    : selPage.layout === 'spread' ? (carousel ? 'Runs across both slides as you swipe. The border stays on the outside edges; only the join is open.' : 'Fills both facing pages. The outer margin stays so it prints safely; only the fold is borderless.')
    : selPage.layout === 'two' ? 'Portraits sit side by side; landscapes stack.' : selPage.layout === 'three' ? 'Two portraits and one landscape. Choose which goes on top.' : selPage.layout === 'blank' ? `An empty ${word}.` : '';
  // A notebook page shows its number and note unless its facing page is set blank, so its text starts on.
  const text = selPage?.text ?? (notebook ? { ...DEFAULT_TEXT, on: true } : DEFAULT_TEXT);
  const noteOn = text.on;
  const setText = (patch: Partial<PageText>, persist = true) => { if (sel == null || !selPage) return; const pages = z.pages.map((p, i) => (i === sel ? { ...p, text: { ...text, ...patch } } : p)); if (persist) setPages(pages); else setZ({ ...z, pages }); };
  const layoutName = (k: Layout) => (k === 'spread' && carousel ? 'Across two slides' : LAYOUTS.find(([x]) => x === k)![1]);
  const segBtn = (on: boolean, label: string, go: () => void, key: string) => <button key={key} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={go}>{label}</button>;

  const selectionPanel = selPage && sel != null && (
    <section aria-label={`Chosen ${word}`} style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ font: `400 24px/1 ${serif}`, margin: 0 }}>{selTitle}</h2><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{notebook ? 'Photo and note' : zine && nos[0] === 1 ? 'Cover' : zine && nos[nos.length - 1] === printed.length ? 'Back cover' : layoutName(selPage.layout)}</span></div>
      {!notebook && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>Layout</span>
        <div className="seg zine-seg" role="group" aria-label={`${Word} layout`} style={{ alignSelf: 'stretch' }}><SegSlider />
          {LAYOUTS.map(([k]) => { const dis = k === 'spread' && fullCarousel && selPage.layout !== 'spread'; return <button key={k} type="button" className={selPage.layout === k ? 'on' : ''} aria-pressed={selPage.layout === k} disabled={dis} title={dis ? `A carousel holds ${MAX_SLIDES} slides. Remove one first.` : undefined} onClick={() => relayout(sel, k)}>{layoutName(k)}</button>; })}
        </div>
        {selPage.layout === 'three' && (
          <div role="group" aria-label="Arrangement" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            {([['portraits-top', 'Two portraits, landscape below'], ['landscape-top', 'Landscape, two portraits below']] as const).map(([k, l]) => { const on = (selPage.arrange ?? 'portraits-top') === k; return (
              <button key={k} type="button" aria-pressed={on} onClick={() => edit(sel, { arrange: k })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 8px', borderRadius: 8, fontSize: 12.5, color: on ? 'var(--text)' : 'var(--text2)', boxShadow: on ? 'inset 0 0 0 1.5px var(--text)' : 'inset 0 0 0 1px var(--hair)' }}>
                <span aria-hidden style={{ display: 'flex', flexDirection: k === 'portraits-top' ? 'column' : 'column-reverse', gap: 2, width: 22, height: 28, padding: 2, boxSizing: 'border-box', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)' }}><span style={{ flex: 1, display: 'flex', gap: 2 }}><i style={{ flex: 1, background: 'currentColor', opacity: 0.55 }} /><i style={{ flex: 1, background: 'currentColor', opacity: 0.55 }} /></span><i style={{ flex: 1, background: 'currentColor', opacity: 0.55 }} /></span>{l}
              </button>); })}
          </div>
        )}
        <span style={{ minHeight: 36, fontSize: 12.5, lineHeight: 1.45, color: 'var(--muted)', textWrap: 'pretty' } as CSSProperties}>{layoutNote}</span>
      </div>}
      {selPage.photos.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={eyebrow}>Photos</span>
        {selPage.photos.map((photoId, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {photoId ? <img src={imgUrl(photoId, 'thumb')} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 3, flex: 'none' }} /> : <span style={{ width: 44, height: 56, borderRadius: 3, flex: 'none', boxShadow: 'inset 0 0 0 1px var(--outline)' }} />}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: photoId ? 500 : 400, color: photoId ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{photoId ? names[photoId] ?? '…' : selPage.photos.length > 1 ? ['First photo', 'Second photo', 'Third photo'][i] : 'No photo yet'}</span>
            <button className="btn outline" style={pill} onClick={() => setPicking({ entry: sel, slot: i })}>{photoId ? 'Change' : 'Choose'}</button>
          </div>
        ))}
      </div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={eyebrow}>Border</span><span style={{ fontSize: 12, color: 'var(--muted)' }}>All {word}s</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--text2)', fontSize: 12.5 }}>Colour</span>{swatches}</div>
        {borderWidth('Width')}
      </div>
      {notebook && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={eyebrow}>Facing page</span>
            <div className="seg zine-seg compact" role="group" aria-label="Facing page"><SegSlider />{segBtn(noteOn, 'Number and note', () => setText({ on: true }), 'on')}{segBtn(!noteOn, 'Blank', () => setText({ on: false }), 'off')}</div>
          </div>
          {noteOn && <>
            <textarea className="field-in" aria-label="Note" rows={3} maxLength={280} placeholder="A note about the photo" value={text.body} onChange={(e) => setText({ body: e.target.value }, false)} onBlur={(e) => setText({ body: e.target.value })} style={{ resize: 'vertical', fontSize: 13.5, lineHeight: 1.45 }} />
            <div className="seg zine-seg compact" role="group" aria-label="Note style" style={{ alignSelf: 'flex-start' }}><SegSlider />{(['serif', 'mono'] as const).map((k) => segBtn(text.font === k, cap(k), () => setText({ font: k }), k))}</div>
          </>}
        </div>
      )}
      {zine && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={eyebrow}>Text</span>
            <button type="button" role="switch" aria-checked={text.on} aria-label="Text on this page" onClick={() => setText({ on: !text.on })} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)' }}>{text.on ? 'On' : 'Off'}
              <span style={{ width: 34, height: 20, borderRadius: 999, padding: 2, boxSizing: 'border-box', background: text.on ? 'var(--btn-bg)' : 'var(--bg)', display: 'flex', justifyContent: text.on ? 'flex-end' : 'flex-start', boxShadow: 'inset 0 0 0 1px var(--outline)' }}><i style={{ width: 16, height: 16, borderRadius: '50%', background: text.on ? 'var(--btn-fg)' : 'var(--text2)' }} /></span>
            </button>
          </div>
          {text.on && <>
            <textarea className="field-in" aria-label="Page text" rows={2} maxLength={280} placeholder="Add a title or caption" value={text.body} onChange={(e) => setText({ body: e.target.value }, false)} onBlur={(e) => setText({ body: e.target.value })} style={{ resize: 'vertical', fontSize: 13.5, lineHeight: 1.45 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="seg zine-seg compact" role="group" aria-label="Text position"><SegSlider />{(['top', 'middle', 'bottom'] as const).map((k) => segBtn(text.pos === k, cap(k), () => setText({ pos: k }), k))}</div>
              <div className="seg zine-seg compact" role="group" aria-label="Text style"><SegSlider />{(['serif', 'mono'] as const).map((k) => segBtn(text.font === k, cap(k), () => setText({ font: k }), k))}</div>
            </div>
          </>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={eyebrow}>Order</span>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn outline" style={pill} disabled={sel === 0} onClick={() => move(sel, -1)}>← Earlier</button><button className="btn outline" style={pill} disabled={sel === z.pages.length - 1} onClick={() => move(sel, 1)}>Later →</button></div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid var(--hair)', paddingTop: 14, fontSize: 12.5 }}>
        <button type="button" onClick={() => setSel(null)} style={{ color: 'var(--text2)' }}>{What} settings</button>
        <button type="button" onClick={() => removePage(sel, selTitle)} style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><WarningIcon />Remove this {word}</button>
      </div>
    </section>
  );

  const card = (on: boolean, label: string, sub: string, r: number, go: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={go} title={sub} style={{ borderRadius: 10, padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, background: on ? 'var(--text)' : 'transparent', color: on ? 'var(--bg)' : 'var(--text)', boxShadow: on ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 16%, transparent)' }}>
      <span style={{ height: 52, borderRadius: 4, background: on ? 'color-mix(in srgb, var(--bg) 14%, transparent)' : 'var(--wall-bg)', display: 'grid', placeItems: 'center' }}><i style={{ display: 'block', height: r >= 1 ? 30 : 36, aspectRatio: String(r > 1 ? 1 / r : r), background: on ? 'var(--bg)' : 'var(--text)', borderRadius: 1, opacity: 0.85 }} /></span>
      <span style={{ textAlign: 'center' }}>{label}</span>
    </button>
  );
  const settingsPanel = (
    <section aria-label="Settings" style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ font: `400 24px/1 ${serif}`, margin: 0 }}>{What}</h2><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Choose a {word} to edit it</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>{carousel ? 'Slide shape' : notebook ? 'Paper' : 'Print on'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          {carousel ? SHAPES.map(([k, sub]) => card(z.pageSize === k, k, sub, SIZES.find(([s]) => s === k)![2], () => save({ pageSize: k }), k))
            : notebook ? NOTEBOOK_SIZES.map(([k, l, sub]) => card(z.pageSize === k, l, sub, SIZES.find(([s]) => s === k)![2], () => save({ pageSize: k }), k))
            : SHEETS.map(([k, l, sub]) => card(z.pageSize === k, l, sub, 1.414, () => void setSheet(k), k))}
        </div>
        {zine && !isSheet(z.pageSize) && <div className="seg" role="group" aria-label="Number of pages"><SegSlider />{PAGE_COUNTS.map((n) => segBtn(z.pageCount === n, `${n} pages`, () => void setCount(n), String(n)))}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--text2)', fontSize: 13.5 }}>Border colour</span>{swatches}</div>
      {borderWidth('Border')}
      {zine && isSheet(z.pageSize) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={eyebrow}>How to fold</span>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(2,44px)', background: '#fff', boxShadow: '0 0 0 1px var(--hair)' }}>
            {([[5, 1], [4, 1], [3, 1], [2, 1], [6, 0], [7, 0], [8, 0], [1, 0]] as const).map(([n, up]) => <span key={n} style={{ display: 'grid', placeItems: 'center', font: `400 12px ${mono}`, color: '#4f4c47', boxShadow: 'inset 0 0 0 .5px #c9c6bf', background: n === 1 ? '#efede8' : '#fff' }}><span style={{ transform: up ? 'rotate(180deg)' : 'none' }}>{n}</span></span>)}
            <i aria-hidden style={{ position: 'absolute', left: '25%', right: '25%', top: 'calc(50% - 1px)', borderTop: '2px dashed oklch(0.62 0.17 28)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}>
            <span>1 · Print one side at actual size. Fold in half lengthways, then into eighths.</span>
            <span>2 · Cut the dashed line through the middle.</span>
            <span>3 · Push the ends together and fold flat, with page 1 on the front.</span>
          </div>
        </div>
      )}
      <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{settingsNote}</span>
      <span style={{ marginTop: 'auto', fontSize: 12.5, color: 'var(--faint)', borderTop: '1px solid var(--hair)', paddingTop: 14 }}>Download is in the Done panel. Remove with the bin by the name.</span>
    </section>
  );
  const donePanel = (
    <section aria-label="Done" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ font: `400 24px/1 ${serif}`, margin: 0 }}>Done · Read-only</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{emptySlots ? `${emptySlots} empty ${emptySlots > 1 ? 'slots' : 'slot'} will print blank. ` : ''}{carousel ? 'Download the slides to post them.' : notebook ? 'Download the originals to print them.' : 'Download the PDF and print it on one sheet.'}<br /><br />Choose Progress or Review above to make changes.</p>
      {notebook ? <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!placed.size || DEMO} title={DEMO ? 'Downloads are made by a Frames server, so the demo cannot make one.' : undefined} onClick={() => void downloadOriginals(z.pages.flatMap((p) => p.photos.slice(0, 1)).filter((x): x is number => x != null))}>Download originals</button> :
      <a className="btn primary" style={{ alignSelf: 'flex-start' }} href={z.pages.length && !DEMO ? `/api/zines/${z.id}/${carousel ? 'zip' : 'pdf'}` : undefined} aria-disabled={!z.pages.length || DEMO} title={DEMO ? 'Downloads are made by a Frames server, so the demo cannot make one.' : undefined} download>{carousel ? 'Download slides' : 'Download PDF'}</a>}
      <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{settingsNote}</span>
    </section>
  );

  const meta = carousel ? `${printed.length} slides · ${z.pageSize} · Instagram carousel` : `${printed.length} pages · ${sizeLabel(z.pageSize)} · ${What}`;
  const count = notebook ? `${z.pages.length} photo${z.pages.length === 1 ? '' : 's'} · ${printed.length} pages` : zine ? `${printed.length} pages${isSheet(z.pageSize) ? ` · folds from one ${sizeLabel(z.pageSize)}` : ''}` : `${printed.length ? `${visible > 1 ? `${first + 1}–${Math.min(first + visible, printed.length)}` : first + 1} · ` : ''}${printed.length} of ${MAX_SLIDES} slides · ${z.pageSize}`;

  return (
    <div className="page-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: phone ? 'wrap' : 'nowrap' }}>
        <button type="button" onClick={() => nav('/collections')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, color: 'var(--text2)', fontSize: 13.5, background: 'color-mix(in srgb, var(--text) 5%, transparent)', flex: 'none' }}>← <span>Compositions</span></button>
        <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {/* Done shows the name in the same underlined box as the field, so nothing in the header moves when the stage changes. */}
          {readOnly ? <span title={z.name} style={{ display: 'block', font: `400 40px/normal ${serif}`, width: `${Math.max(7, z.name.length + 1)}ch`, maxWidth: '100%', padding: '0 0 4px', borderBottom: '1px solid var(--outline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.name}</span>
            : <EditableCompositionName name={z.name} onSave={async (name) => { setZ(await api<Zine>(`/zines/${z.id}`, { method: 'PUT', body: { name } })); }} />}
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</span>
        </div>
        <button type="button" onClick={() => void removeZine()} title={`Remove ${z.kind}`} aria-label={`Remove ${z.kind}`} className="zine-bin"
          style={{ flex: 'none', width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 999, color: 'var(--muted)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" /></svg>
        </button>
        <span style={{ flex: 1 }} />
        {/* Every stage is always available: Done warns about empty slots instead of being locked. */}
        <CompositionStage value={z.stage ?? 'progress'} full onChange={setStage} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : 'minmax(0,1fr) 340px', gap: 24, marginBottom: 40, alignItems: 'stretch' }}>
        <div ref={wall} onClick={() => setSel(null)} style={{ position: 'relative', minHeight: phone ? 420 : 720, borderRadius: 8, backgroundColor: 'var(--wall-bg)', backgroundImage: 'linear-gradient(var(--wall-grid) 1px,transparent 1px),linear-gradient(90deg,var(--wall-grid) 1px,transparent 1px)', backgroundSize: '24px 24px', padding: phone ? '64px 16px 16px' : '80px 48px 88px', display: 'flex', flexDirection: 'column', justifyContent: carousel ? 'center' : 'flex-start' }}>
          <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 8 }}>
            <WallButton onClick={(e) => { e.stopPropagation(); if (document.fullscreenElement) void document.exitFullscreen(); else void wall.current?.requestFullscreen(); }}>⤢ Full screen</WallButton>
          </div>
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8 }}>
            {!readOnly && carousel && printed.length < MAX_SLIDES && <WallButton onClick={(e) => { e.stopPropagation(); addSlide(); }}>+ Slide</WallButton>}
            {!readOnly && notebook && z.pages.length < MAX_PAGES && <WallButton onClick={(e) => { e.stopPropagation(); addSlide(); }}>+ Page</WallButton>}
            <WallButton disabled={readOnly || !unplaced} title={readOnly ? 'Done · read-only' : unplaced ? `Place ${unplaced} candidate${unplaced > 1 ? 's' : ''} in the empty slots, in order` : 'Every candidate is placed'} onClick={(e) => { e.stopPropagation(); fill(); }}>Fill in order</WallButton>
          </div>
          {!z.pages.length ? <p className="muted" style={{ textAlign: 'center' }}>No {word}s yet. Add one, or use Fill in order.</p> : carousel ? carouselRow : notebook ? notebookGrid : zineGrid}
          {/* On a phone the hint wraps, so it sits below the pages instead of over them. */}
          <div style={phone ? { marginTop: 'auto', paddingTop: 28, display: 'flex', alignItems: 'flex-end', gap: 12 } : { position: 'absolute', left: 14, right: 16, bottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>{readOnly ? 'Done · read-only' : `Click a ${word} to edit it · drag a photo onto another to swap`}</span>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--text2)' }}>{count}</span>
          </div>
        </div>
        <aside className="zine-panel" style={{ background: 'var(--surface)', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13.5, order: phone ? -1 : 0 }}>
          {readOnly ? donePanel : selectionPanel || settingsPanel}
        </aside>
      </div>

      <section aria-label="Candidates" style={{ paddingTop: 20, borderTop: '1px solid var(--hair)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ font: `400 26px/1 ${serif}`, margin: 0 }}>Candidates</h2>
          <span className="mono faint" style={{ fontSize: 11 }}>{z.candidates.length} · {placed.size} placed · {unplaced} not placed</span>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--danger)' }}>{carousel && unplaced && fullCarousel ? `${unplaced} photo${unplaced > 1 ? 's' : ''} didn’t fit. A carousel holds ${MAX_SLIDES} slides.` : ''}</span>
          {/* While Done these stay in place, unavailable, so the row does not change shape. */}
          <button className="btn outline" style={pill} disabled={readOnly || !unplaced} onClick={fill}>Fill in order</button>
          <button className="btn outline" style={pill} disabled={readOnly} title={readOnly ? 'Choose Progress or Review to add photos' : undefined} onClick={() => setAdding(true)}>Add photos…</button>
        </div>
        {!z.candidates.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No candidates yet. Add photos here, or from the Library with Add to composition…, then {carousel ? 'Instagram carousel' : What}.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 12 }}>
          {z.candidates.map((cid) => (
            <div key={cid} className="zine-cand" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={imgUrl(cid, 'thumb')} alt="" draggable={!readOnly} title={readOnly ? undefined : `Drag onto a ${word}`} onDragStart={(e) => { e.dataTransfer.setData('application/x-frames-photo', String(cid)); e.dataTransfer.effectAllowed = 'copy'; }}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: readOnly ? 'default' : 'grab', opacity: placed.has(cid) ? 0.55 : 1 }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                {!placed.has(cid) && <i aria-hidden style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: 'var(--text)' }} />}
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: placed.has(cid) ? 'var(--faint)' : 'var(--text)', fontWeight: placed.has(cid) ? 400 : 500 }}>{placed.has(cid) ? whereLabel(placed.get(cid)!) : 'Not placed'}</span>
                {!readOnly && <button type="button" className="zine-cand-remove" onClick={() => removeCandidate(cid)} style={{ flex: 'none', color: 'var(--muted)', fontSize: 12 }} aria-label="Remove this candidate">Remove</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {toast && (
        <ToastSlot>
          <span>{toast.text}</span>{toast.undo ? <button type="button" onClick={toast.undo} style={{ height: 28, padding: '0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>Undo</button> : <span style={{ width: 8 }} />}
        </ToastSlot>
      )}
      {picking && <PhotoPicker candidates={z.candidates} onPick={choose} onClose={() => setPicking(null)}
        subtitle={`For ${word} ${pageNos(picking.entry)[0] ?? ''} · photos already on a ${word} are marked`}
        marks={new Map(z.candidates.flatMap((cid): [number, string][] => { const here = z.pages[picking.entry]?.photos[picking.slot] === cid; const at = placed.get(cid); return here ? [[cid, 'This one']] : at ? [[cid, `${carousel ? 'S' : 'P'} ${at.join(', ')}`]] : []; }))} />}
      {adding && <PhotoPicker title="Add candidates" multiple onPick={(pid) => addCandidates([pid])} chosen={z.candidates} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Choose a photograph: the zine's candidates first, then the library, with a search. With `multiple` it stays open, and ticks what is chosen. */
function PhotoPicker({ onPick, onClose, candidates = [], title = 'Choose a photo', subtitle, marks, multiple = false, chosen = [] }: { onPick: (id: number) => void; onClose: () => void; candidates?: number[]; title?: string; subtitle?: string; marks?: Map<number, string>; multiple?: boolean; chosen?: number[] }) {
  const [q, setQ] = useState(''), [settled, setSettled] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setSettled(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  const list = useApi<{ photos: PhotoLite[] }>(`/photos${settled ? `?query=${encodeURIComponent(settled)}` : ''}`);
  const photos = list.data?.photos ?? [];
  return (
    <Modal title={title} width={760} onClose={onClose}>
      {subtitle && <p style={{ margin: '-6px 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>{subtitle}</p>}
      {candidates.length > 0 && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><span className="eyebrow">Candidates</span>{marks && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Not placed first</span>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 16 }}>
          {/* Photographs already used are marked with where they are, and listed after the ones not placed yet. */}
          {(marks ? [...candidates.filter((id) => !marks.has(id)), ...candidates.filter((id) => marks.has(id))] : candidates).map((id) => { const mark = marks?.get(id), here = mark === 'This one'; return (
            <button key={id} type="button" onClick={() => onPick(id)} aria-label={mark ? `Candidate ${id}, ${here ? 'in this slot' : `on ${mark}`}` : `Candidate ${id}`} style={{ position: 'relative', aspectRatio: '1', background: `url(${imgUrl(id, 'thumb')}) center/cover var(--surface)`, borderRadius: 6, boxShadow: here ? '0 0 0 2px var(--text)' : 'none' }}>
              {mark && <span aria-hidden style={{ position: 'absolute', left: 6, bottom: 6, padding: '2px 6px', borderRadius: 999, background: 'rgba(13,13,13,.78)', color: '#efede8', font: `500 10.5px ${mono}` }}>{mark}</span>}
            </button>); })}
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
