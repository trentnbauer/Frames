import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { Idea, IdeaPhoto } from '../types.js';
import { useEscapeKey } from '../useEscapeKey.js';
import { useToast } from '../toast.js';

// Ported from a Claude Design mockup ("Zine Creator") — a manual, page-by-page
// zine layout tool (covers + interior spreads, each independently laid out),
// distinct from the auto-generated single-sheet fold export elsewhere in the
// app. Colors/typography use Frames' own --bg/--surface/--text/--accent
// tokens (theme + user accent), not the mockup's own palette — only the
// zine's own selectable cover font is a deliberate exception, since that's
// the one place the mockup's "pick a display font for your cover" feature is
// meant to show through.

type ImageMode = 'none' | 'portrait' | 'landscape1' | 'landscape2';
type VAlign = 'top' | 'middle' | 'bottom';
type HAlign = 'left' | 'center' | 'right';
type PaperSize = 'Letter' | 'A4' | 'A3' | 'A2';
type SpanMode = 'split' | 'span';

interface BorderSetting {
  pct: number;
  color: string;
}

type ImageFit = 'cover' | 'contain';

interface CoverSettings {
  header: string;
  sub1: string;
  sub2: string;
  imageMode: ImageMode;
  imageFit: ImageFit;
  borderPct: number;
  borderColor: string;
  bgColor: string;
  textVAlign: VAlign;
  textHAlign: HAlign;
}

interface SpreadSettings {
  spanMode: SpanMode;
  modeL: ImageMode;
  modeR: ImageMode;
  modeSpan: ImageMode;
  fitL: ImageFit;
  fitR: ImageFit;
  fitSpan: ImageFit;
  borderL: BorderSetting;
  borderR: BorderSetting;
  borderSpan: BorderSetting;
}

const MIN_PAGE_COUNT = 4;
const MAX_PAGE_COUNT = 48;
const SPREAD_IDS = Array.from({ length: (MAX_PAGE_COUNT - 2) / 2 }, (_, i) => `s${i + 1}`);
const FONT_CHOICES = ['Inter', 'Playfair Display', 'Bebas Neue', 'Space Mono', 'Courier Prime', 'Poppins'];
const PAPER_SIZES: Record<PaperSize, { wIn: number; hIn: number }> = {
  Letter: { wIn: 8.5, hIn: 11 },
  A4: { wIn: 8.27, hIn: 11.69 },
  A3: { wIn: 11.69, hIn: 16.54 },
  A2: { wIn: 16.54, hIn: 23.39 },
};
function defaultCover(header: string, sub1: string, sub2: string): CoverSettings {
  return { header, sub1, sub2, imageMode: 'portrait', imageFit: 'cover', borderPct: 0, borderColor: '#ffffff', bgColor: '#161826', textVAlign: 'bottom', textHAlign: 'left' };
}

function defaultSpread(): SpreadSettings {
  return {
    spanMode: 'split',
    modeL: 'portrait', modeR: 'portrait', modeSpan: 'landscape2',
    fitL: 'cover', fitR: 'cover', fitSpan: 'cover',
    borderL: { pct: 0, color: '#ffffff' }, borderR: { pct: 0, color: '#ffffff' }, borderSpan: { pct: 0, color: '#ffffff' },
  };
}

function imageSlotsFor(mode: ImageMode, baseKey: string): string[] {
  if (mode === 'none') return [];
  return mode === 'landscape2' ? [`${baseKey}-0`, `${baseKey}-1`] : [`${baseKey}-0`];
}

function isCoverId(id: string): id is 'front' | 'back' {
  return id === 'front' || id === 'back';
}

// portraitAspect is the *selected paper size's own* w/h ratio — Letter
// (0.773) and the ISO A-series (~0.707) are visibly different shapes, so
// the on-screen page boxes need to reflect whichever is actually chosen,
// not a fixed ratio. Export already used the real paper dimensions in
// pixels throughout; only this live preview sizing had the fixed value.
function fullSize(canvasSize: { w: number; h: number }, wide: boolean, count: number, portraitAspect: number) {
  const gap = 10;
  if (wide) {
    const spanAspect = portraitAspect * 2;
    let h = canvasSize.h;
    let w = h * spanAspect;
    if (w > canvasSize.w) { h = h * (canvasSize.w / w); w = canvasSize.w; }
    return { w, h };
  }
  let h = canvasSize.h;
  const totalW = count * h * portraitAspect + (count - 1) * gap;
  if (totalW > canvasSize.w) h = h * (canvasSize.w / totalW);
  return { w: h * portraitAspect, h };
}

function overlayStyle(vAlign: VAlign, hAlign: HAlign): React.CSSProperties {
  const justifyContent = vAlign === 'top' ? 'flex-start' : vAlign === 'middle' ? 'center' : 'flex-end';
  const alignItems = hAlign === 'left' ? 'flex-start' : hAlign === 'center' ? 'center' : 'flex-end';
  const background =
    vAlign === 'top'
      ? 'linear-gradient(to bottom, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)'
      : vAlign === 'middle'
        ? 'rgba(0,0,0,.38)'
        : 'linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)';
  return { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent, alignItems, textAlign: hAlign, gap: 8, padding: 28, pointerEvents: 'none', background, zIndex: 1 };
}

interface Props {
  projectId: number;
  onExit: () => void;
}

export function ZineCreator({ projectId, onExit }: Props) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [pageCount, setPageCountState] = useState(8);
  const [paperSize, setPaperSize] = useState<PaperSize>('Letter');
  const [fontChoice, setFontChoice] = useState('Inter');
  const [headerSize, setHeaderSize] = useState(28);
  const [subSize, setSubSize] = useState(15);
  const [selectedId, setSelectedId] = useState('front');
  const [coverSettings, setCoverSettings] = useState<{ front: CoverSettings; back: CoverSettings }>(() => ({
    front: defaultCover('Zine Title', 'A one-line tagline', ''),
    back: defaultCover('Thanks for reading', 'follow @yourhandle', ''),
  }));
  const [spreadSettings, setSpreadSettings] = useState<Record<string, SpreadSettings>>(() => {
    const m: Record<string, SpreadSettings> = {};
    for (const id of SPREAD_IDS) m[id] = defaultSpread();
    return m;
  });
  const [slotPhotos, setSlotPhotos] = useState<Record<string, number>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'pages' | 'booklet' | 'zine'>('zine');
  const [exporting, setExporting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const showToast = useToast();

  useEffect(() => {
    api.ideas.get(projectId).then((res) => {
      setIdea(res.idea);
      setPhotos(res.photos);
    });
  }, [projectId]);

  // Loaded once, on demand — these display fonts are only used for the
  // zine's own cover text, not the rest of the app's UI.
  useEffect(() => {
    const id = 'zine-creator-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Bebas+Neue&family=Space+Mono:wght@700&family=Courier+Prime:wght@700&family=Poppins:wght@600&display=swap';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize((s) => (Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1 ? { w: r.width, h: r.height } : s));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEscapeKey(pickerSlot !== null, () => setPickerSlot(null));
  useEscapeKey(exportOpen, () => setExportOpen(false));

  function visibleIds(): string[] {
    const n = (pageCount - 2) / 2;
    return ['front', ...SPREAD_IDS.slice(0, n), 'back'];
  }

  function spreadLabel(id: string): string {
    const idx = SPREAD_IDS.indexOf(id);
    const start = 2 + idx * 2;
    return `${start}–${start + 1}`;
  }

  // Page count always moves in steps of 4 — every export mode needs that:
  // booklet imposition holds exactly 4 pages per sheet, and the one-sheet
  // "Zine" fold only exists at 8 or 16 (see below). Zine is auto-selected
  // whenever the count lands on one of those two; anything else falls back
  // to Booklet, per the user's own rule ("8 or 16 gets a zine, anything
  // else defaults to booklet") — still overridable by hand afterward.
  function changePageCount(delta: number) {
    const n = Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, pageCount + delta));
    const spreadCount = (n - 2) / 2;
    const visible = ['front', ...SPREAD_IDS.slice(0, spreadCount), 'back'];
    setPageCountState(n);
    setSelectedId((cur) => (visible.includes(cur) ? cur : 'front'));
    if (n === 8 || n === 16) {
      setExportMode('zine');
    } else {
      setExportMode((mode) => (mode === 'zine' ? 'booklet' : mode));
    }
  }

  function updateCover(id: 'front' | 'back', patch: Partial<CoverSettings>) {
    setCoverSettings((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function updateSpread(id: string, patch: Partial<SpreadSettings>) {
    setSpreadSettings((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function updateSpreadBorder(id: string, key: 'borderL' | 'borderR' | 'borderSpan', patch: Partial<BorderSetting>) {
    setSpreadSettings((s) => ({ ...s, [id]: { ...s[id], [key]: { ...s[id][key], ...patch } } }));
  }

  function clearSlot(slotKey: string) {
    setSlotPhotos((s) => {
      const next = { ...s };
      delete next[slotKey];
      return next;
    });
  }

  function assignSlot(slotKey: string, photoId: number) {
    setSlotPhotos((s) => ({ ...s, [slotKey]: photoId }));
    setPickerSlot(null);
  }

  interface PageBox {
    key: string;
    size: { w: number; h: number };
    bgColor: string;
    images: string[];
    imageFit: ImageFit;
    borderColor: string;
    borderPct: number;
    cover?: CoverSettings;
  }

  const portraitAspect = PAPER_SIZES[paperSize].wIn / PAPER_SIZES[paperSize].hIn;

  function canvasPagesForSelected(): PageBox[] {
    const id = selectedId;
    if (isCoverId(id)) {
      const st = coverSettings[id];
      return [{ key: id, size: fullSize(canvasSize, false, 1, portraitAspect), bgColor: st.bgColor, images: imageSlotsFor(st.imageMode, `${id}-img`), imageFit: st.imageFit, borderColor: st.borderColor, borderPct: st.borderPct, cover: st }];
    }
    const st = spreadSettings[id];
    if (st.spanMode === 'span') {
      return [{ key: `${id}-span`, size: fullSize(canvasSize, true, 1, portraitAspect), bgColor: '#ffffff', images: imageSlotsFor(st.modeSpan, `${id}-span`), imageFit: st.fitSpan, borderColor: st.borderSpan.color, borderPct: st.borderSpan.pct }];
    }
    const size = fullSize(canvasSize, false, 2, portraitAspect);
    return [
      { key: `${id}-L`, size, bgColor: '#ffffff', images: imageSlotsFor(st.modeL, `${id}-L`), imageFit: st.fitL, borderColor: st.borderL.color, borderPct: st.borderL.pct },
      { key: `${id}-R`, size, bgColor: '#ffffff', images: imageSlotsFor(st.modeR, `${id}-R`), imageFit: st.fitR, borderColor: st.borderR.color, borderPct: st.borderR.pct },
    ];
  }

  function thumbBoxesFor(id: string): { style: React.CSSProperties; photoId?: number }[] {
    const THUMB_H = 92;
    const box = (aspect: number, bgColor: string): React.CSSProperties => ({
      height: THUMB_H, width: THUMB_H * aspect, background: bgColor, boxSizing: 'border-box', overflow: 'hidden',
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--text) 20%, transparent)', borderRadius: 1, flex: 'none',
    });
    const firstPhoto = (slots: string[]) => (slots.length ? slotPhotos[slots[0]] : undefined);
    if (isCoverId(id)) {
      const st = coverSettings[id];
      return [{ style: box(portraitAspect, st.bgColor), photoId: firstPhoto(imageSlotsFor(st.imageMode, `${id}-img`)) }];
    }
    const st = spreadSettings[id];
    if (st.spanMode === 'span') {
      return [{ style: box(portraitAspect * 2, '#ffffff'), photoId: firstPhoto(imageSlotsFor(st.modeSpan, `${id}-span`)) }];
    }
    return [
      { style: box(portraitAspect, '#ffffff'), photoId: firstPhoto(imageSlotsFor(st.modeL, `${id}-L`)) },
      { style: box(portraitAspect, '#ffffff'), photoId: firstPhoto(imageSlotsFor(st.modeR, `${id}-R`)) },
    ];
  }

  // One entry per physical zine page, in reading order (front cover ...
  // back cover) — 'L'/'R' are the independent halves of a split spread,
  // 'span-left'/'span-right' are the two physical halves of one spanning
  // image (rendered together, then sliced, so the image lines up across
  // the fold no matter what target size they're rendered at).
  function buildPageOwners(): { id: string; part: 'cover' | 'L' | 'R' | 'span-left' | 'span-right' }[] {
    const owners: { id: string; part: 'cover' | 'L' | 'R' | 'span-left' | 'span-right' }[] = [];
    for (const id of visibleIds()) {
      if (isCoverId(id)) {
        owners.push({ id, part: 'cover' });
      } else {
        const st = spreadSettings[id];
        if (st.spanMode === 'split') {
          owners.push({ id, part: 'L' });
          owners.push({ id, part: 'R' });
        } else {
          owners.push({ id, part: 'span-left' });
          owners.push({ id, part: 'span-right' });
        }
      }
    }
    return owners;
  }

  // Renders exactly one physical page's content at an arbitrary target
  // size — the same underlying photo/border/cover-text logic serves both
  // full-paper-size export (pages/booklet) and the zine fold's smaller,
  // differently-proportioned panels. wideCache avoids re-rendering a
  // spanning image's wide composition twice for its left/right halves.
  async function renderOwnerAt(
    owner: { id: string; part: 'cover' | 'L' | 'R' | 'span-left' | 'span-right' },
    widthPx: number,
    heightPx: number,
    wideCache: Map<string, HTMLCanvasElement>
  ): Promise<HTMLCanvasElement> {
    if (owner.part === 'cover') {
      const st = coverSettings[owner.id as 'front' | 'back'];
      return renderPageCanvas({
        widthPx, heightPx, bgColor: st.bgColor, images: imageSlotsFor(st.imageMode, `${owner.id}-img`), imageFit: st.imageFit, slotPhotos,
        borderColor: st.borderColor, borderPct: st.borderPct,
        overlay: { header: st.header, sub1: st.sub1, sub2: st.sub2, vAlign: st.textVAlign, hAlign: st.textHAlign, font: fontChoice, headerSize, subSize },
      });
    }
    const st = spreadSettings[owner.id];
    if (owner.part === 'L') return renderPageCanvas({ widthPx, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeL, `${owner.id}-L`), imageFit: st.fitL, slotPhotos, borderColor: st.borderL.color, borderPct: st.borderL.pct });
    if (owner.part === 'R') return renderPageCanvas({ widthPx, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeR, `${owner.id}-R`), imageFit: st.fitR, slotPhotos, borderColor: st.borderR.color, borderPct: st.borderR.pct });

    const cacheKey = `${owner.id}-${widthPx}x${heightPx}`;
    let wide = wideCache.get(cacheKey);
    if (!wide) {
      wide = await renderPageCanvas({ widthPx: widthPx * 2, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeSpan, `${owner.id}-span`), imageFit: st.fitSpan, slotPhotos, borderColor: st.borderSpan.color, borderPct: st.borderSpan.pct });
      wideCache.set(cacheKey, wide);
    }
    return owner.part === 'span-left' ? sliceCanvas(wide, 0, 0, widthPx, heightPx) : sliceCanvas(wide, widthPx, 0, widthPx, heightPx);
  }

  // The classic one-sheet, single-sided, 8-page "cut-and-fold" zine: fold a
  // landscape sheet into eighths, slit the center fold across its middle two
  // panels only, then fold into a booklet. A single printed side becomes a
  // fully readable 8-page booklet. Panel grid (top row rotated 180°, cover
  // and back cover landing in the top row) is the standard layout for this
  // fold — verified earlier against this exact page order and rotation.
  async function renderZineFoldSheet(
    sheetOwners: { id: string; part: 'cover' | 'L' | 'R' | 'span-left' | 'span-right' }[],
    paper: { wIn: number; hIn: number },
    dpi: number
  ): Promise<HTMLCanvasElement> {
    const cols = 4, rows = 2;
    const canvasW = Math.round(paper.hIn * dpi); // landscape: paper's height becomes the sheet's width
    const canvasH = Math.round(paper.wIn * dpi);
    const panelW = canvasW / cols;
    const panelH = canvasH / rows;

    const wideCache = new Map<string, HTMLCanvasElement>();
    const pageImgs: HTMLCanvasElement[] = [];
    for (const owner of sheetOwners) pageImgs.push(await renderOwnerAt(owner, panelW, panelH, wideCache));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW; canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // top row (rotated 180°): page6, page7, page8(back cover), page1(cover)
    // bottom row (upright): page5, page4, page3, page2
    const panels = [
      { row: 0, col: 0, idx: 5, rotate: true },
      { row: 0, col: 1, idx: 6, rotate: true },
      { row: 0, col: 2, idx: 7, rotate: true },
      { row: 0, col: 3, idx: 0, rotate: true },
      { row: 1, col: 0, idx: 4, rotate: false },
      { row: 1, col: 1, idx: 3, rotate: false },
      { row: 1, col: 2, idx: 2, rotate: false },
      { row: 1, col: 3, idx: 1, rotate: false },
    ];

    for (const p of panels) {
      const x = p.col * panelW, y = p.row * panelH;
      const img = pageImgs[p.idx];
      if (!img) continue;
      ctx.save();
      if (p.rotate) {
        ctx.translate(x + panelW / 2, y + panelH / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -panelW / 2, -panelH / 2, panelW, panelH);
      } else {
        ctx.drawImage(img, x, y, panelW, panelH);
      }
      ctx.restore();
    }

    // Fold guides: dashed lines at every panel boundary, plus a solid
    // "cut here" mark across the inner two panels of the center fold.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * panelW, 0);
      ctx.lineTo(c * panelW, canvasH);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, panelH); ctx.lineTo(panelW, panelH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 * panelW, panelH); ctx.lineTo(4 * panelW, panelH); ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = '#e0524f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(panelW, panelH);
    ctx.lineTo(3 * panelW, panelH);
    ctx.stroke();

    return canvas;
  }

  async function exportPdf() {
    setExporting(true);
    try {
      // jsPDF pulls in a large font/canvas toolchain — code-split so it only
      // loads when someone actually exports, not on every page in the app.
      const { jsPDF } = await import('jspdf');

      const paper = PAPER_SIZES[paperSize];
      const dpi = 300;
      const wPx = Math.round(paper.wIn * dpi);
      const hPx = Math.round(paper.hIn * dpi);
      const owners = buildPageOwners();

      let pdf: InstanceType<typeof jsPDF> | undefined;
      const addPdfPage = (dataUrl: string, wIn: number, hIn: number) => {
        const orientation = wIn > hIn ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ unit: 'in', format: [wIn, hIn], orientation });
        else pdf.addPage([wIn, hIn], orientation);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, wIn, hIn);
      };

      if (exportMode === 'pages' || exportMode === 'booklet') {
        const wideCache = new Map<string, HTMLCanvasElement>();
        const pages: HTMLCanvasElement[] = [];
        for (const owner of owners) pages.push(await renderOwnerAt(owner, wPx, hPx, wideCache));

        if (exportMode === 'pages') {
          for (const canvas of pages) addPdfPage(canvas.toDataURL('image/jpeg', 0.92), paper.wIn, paper.hIn);
        } else {
          // Saddle-stitch imposition: N pages (padded to the nearest multiple
          // of 4, if needed, with blank trailing pages) become N/4 sheets,
          // each holding 2 pages per side. The standard imposition formula
          // pairs pages that sum to N+1 on every side, so the nested, folded
          // stack reads in order front-to-back. No page rotation needed
          // (unlike the one-sheet cut-and-fold zine below) — every page sits
          // right-side-up in its imposed position.
          while (pages.length % 4 !== 0) {
            const blank = document.createElement('canvas');
            blank.width = wPx; blank.height = hPx;
            blank.getContext('2d')!.fillRect(0, 0, wPx, hPx);
            pages.push(blank);
          }
          const n = pages.length;
          const sheets = n / 4;
          for (let s = 0; s < sheets; s++) {
            const front = document.createElement('canvas');
            front.width = wPx * 2; front.height = hPx;
            const fctx = front.getContext('2d')!;
            fctx.drawImage(pages[n - 2 * s - 1], 0, 0); // front-left
            fctx.drawImage(pages[2 * s], wPx, 0); // front-right
            addPdfPage(front.toDataURL('image/jpeg', 0.92), paper.wIn * 2, paper.hIn);

            const back = document.createElement('canvas');
            back.width = wPx * 2; back.height = hPx;
            const bctx = back.getContext('2d')!;
            bctx.drawImage(pages[2 * s + 1], 0, 0); // back-left
            bctx.drawImage(pages[n - 2 * s - 2], wPx, 0); // back-right
            addPdfPage(back.toDataURL('image/jpeg', 0.92), paper.wIn * 2, paper.hIn);
          }
        }
      } else {
        // One-sheet cut-and-fold zine: exactly 8 pages per sheet (the
        // classic single-cut, triple-fold format — verified panel layout,
        // see renderZineFoldSheet). 16 pages = two independent 8-page
        // sheets, each folded the same way and nested together.
        for (let start = 0; start < owners.length; start += 8) {
          const sheet = await renderZineFoldSheet(owners.slice(start, start + 8), paper, dpi);
          addPdfPage(sheet.toDataURL('image/jpeg', 0.92), paper.hIn, paper.wIn);
        }
      }

      const suffix = exportMode === 'booklet' ? '-booklet' : exportMode === 'zine' ? '-zine' : '';
      pdf!.save(`${(idea?.title || 'zine').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${suffix}.pdf`);
      showToast(
        exportMode === 'booklet'
          ? 'Booklet PDF downloaded — print double-sided (flip on short edge), fold the stack once, staple the spine.'
          : exportMode === 'zine'
            ? 'Zine PDF downloaded — print single-sided, follow the fold guide on each sheet.'
            : 'PDF downloaded'
      );
      setExportOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (!idea) return null;

  const selectedIsCover = isCoverId(selectedId);
  const selectedCover = selectedIsCover ? coverSettings[selectedId as 'front' | 'back'] : null;
  const selectedSpread = !selectedIsCover ? spreadSettings[selectedId] : null;
  const pageBoxes = canvasPagesForSelected();

  return (
    <div className="zine-creator">
      <nav className="zine-creator__nav">
        <button className="back-link" onClick={onExit} style={{ marginRight: 12 }}>← {idea.title}</button>
        <span className="zine-creator__brand">Zine Creator</span>
        <div className="zine-creator__nav-controls">
          <div className="zine-page-stepper" title="Add or remove pages (in fours — a Zine sheet holds 8, a Booklet sheet holds 4)">
            <button type="button" onClick={() => changePageCount(-4)} disabled={pageCount <= MIN_PAGE_COUNT}>−</button>
            <span>{pageCount} pages</span>
            <button type="button" onClick={() => changePageCount(4)} disabled={pageCount >= MAX_PAGE_COUNT}>+</button>
          </div>
          <div className="segmented">
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
              <span key={size} className={`segmented__opt ${paperSize === size ? 'active' : ''}`} onClick={() => setPaperSize(size)}>{size}</span>
            ))}
          </div>
          <select className="field-input" style={{ width: 'auto' }} value={fontChoice} onChange={(e) => setFontChoice(e.target.value)} title="Cover font">
            {FONT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="zine-size-input" title="Header size">
            H
            <input type="number" min={12} max={80} value={headerSize} onChange={(e) => setHeaderSize(Number(e.target.value) || 28)} />
          </label>
          <label className="zine-size-input" title="Subtext size">
            S
            <input type="number" min={8} max={40} value={subSize} onChange={(e) => setSubSize(Number(e.target.value) || 15)} />
          </label>
          <button className="btn btn-solid" onClick={() => setExportOpen(true)}>Export PDF</button>
        </div>
      </nav>

      <div className="zine-creator__body">
        <div className="zine-creator__thumbs">
          {visibleIds().map((id) => (
            <div key={id} className={`zine-thumb ${selectedId === id ? 'is-selected' : ''}`} onClick={() => setSelectedId(id)}>
              <div className="zine-thumb__boxes">
                {thumbBoxesFor(id).map((b, i) => (
                  <div key={i} style={b.style}>
                    {b.photoId != null && <img src={`/files/thumb/${b.photoId}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                ))}
              </div>
              <div className="zine-thumb__label">{id === 'front' ? 'Front' : id === 'back' ? 'Back' : `Pages ${spreadLabel(id)}`}</div>
            </div>
          ))}
        </div>

        <div className="zine-creator__main">
          <div className="zine-creator__canvas-wrap">
            <div ref={canvasRef} className="zine-creator__canvas-measure">
              {pageBoxes.map((p) => (
                <div key={p.key} className="zine-page" style={{ width: p.size.w, height: p.size.h, background: p.bgColor, flexDirection: p.images.length > 1 ? 'column' : 'row' }}>
                  {p.cover && (
                    <div style={overlayStyle(p.cover.textVAlign, p.cover.textHAlign)}>
                      <div style={{ color: '#fff', fontFamily: `"${fontChoice}", sans-serif`, fontSize: headerSize, fontWeight: 600, lineHeight: 1.2 }}>{p.cover.header}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: subSize, lineHeight: 1.3 }}>{p.cover.sub1}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: subSize, lineHeight: 1.3 }}>{p.cover.sub2}</div>
                    </div>
                  )}
                  {p.images.map((slotKey) => (
                    <div key={slotKey} className="zine-slot-wrap" style={{ padding: `${p.borderPct}%`, background: p.borderColor }}>
                      <ZineImageSlot photoId={slotPhotos[slotKey]} fit={p.imageFit} fillColor={p.borderColor} onPick={() => setPickerSlot(slotKey)} onClear={() => clearSlot(slotKey)} />
                    </div>
                  ))}
                  {p.images.length === 0 && <div className="zine-slot-empty">No image</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="zine-creator__panel">
            <div className="zine-creator__panel-title">{selectedIsCover ? (selectedId === 'front' ? 'Front cover' : 'Back cover') : `Pages ${spreadLabel(selectedId)}`}</div>

            {selectedCover && (
              <>
                <div className="modal-field zine-field-sm"><label>Header</label><input value={selectedCover.header} onChange={(e) => updateCover(selectedId as 'front' | 'back', { header: e.target.value })} /></div>
                <div className="modal-field zine-field-sm"><label>Subtext</label><input value={selectedCover.sub1} onChange={(e) => updateCover(selectedId as 'front' | 'back', { sub1: e.target.value })} /></div>
                <div className="modal-field zine-field-sm"><label>Subtext</label><input value={selectedCover.sub2} onChange={(e) => updateCover(selectedId as 'front' | 'back', { sub2: e.target.value })} /></div>
                <div className="zine-field">
                  <label>Cover color</label>
                  <input type="color" value={selectedCover.bgColor} onChange={(e) => updateCover(selectedId as 'front' | 'back', { bgColor: e.target.value })} className="zine-color-input" />
                </div>
                <div className="zine-field">
                  <label>Image</label>
                  <div className="segmented">
                    {(['none', 'portrait', 'landscape1', 'landscape2'] as ImageMode[]).map((m) => (
                      <span key={m} className={`segmented__opt ${selectedCover.imageMode === m ? 'active' : ''}`} onClick={() => updateCover(selectedId as 'front' | 'back', { imageMode: m })}>
                        {m === 'none' ? 'None' : m === 'portrait' ? 'Portrait' : m === 'landscape1' ? 'Landscape ×1' : 'Landscape ×2'}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedCover.imageMode !== 'none' && (
                  <div className="zine-field">
                    <label>Photo fit</label>
                    <div className="segmented">
                      <span className={`segmented__opt ${selectedCover.imageFit === 'cover' ? 'active' : ''}`} onClick={() => updateCover(selectedId as 'front' | 'back', { imageFit: 'cover' })} title="Crop to fill the slot">Fill</span>
                      <span className={`segmented__opt ${selectedCover.imageFit === 'contain' ? 'active' : ''}`} onClick={() => updateCover(selectedId as 'front' | 'back', { imageFit: 'contain' })} title="Show the whole photo, uncropped">Whole photo</span>
                    </div>
                  </div>
                )}
                <div className="zine-field">
                  <label>Border color</label>
                  <input type="color" value={selectedCover.borderColor} onChange={(e) => updateCover(selectedId as 'front' | 'back', { borderColor: e.target.value })} className="zine-color-input" />
                </div>
                <div className="zine-field" style={{ width: 180 }}>
                  <label>Border {selectedCover.borderPct}%</label>
                  <input type="range" min={0} max={30} step={1} value={selectedCover.borderPct} onChange={(e) => updateCover(selectedId as 'front' | 'back', { borderPct: Number(e.target.value) })} className="zine-range" />
                </div>
                <div className="zine-field">
                  <label>Text vertical</label>
                  <div className="segmented">
                    {(['top', 'middle', 'bottom'] as VAlign[]).map((v) => (
                      <span key={v} className={`segmented__opt ${selectedCover.textVAlign === v ? 'active' : ''}`} onClick={() => updateCover(selectedId as 'front' | 'back', { textVAlign: v })}>{v[0].toUpperCase() + v.slice(1)}</span>
                    ))}
                  </div>
                </div>
                <div className="zine-field">
                  <label>Text horizontal</label>
                  <div className="segmented">
                    {(['left', 'center', 'right'] as HAlign[]).map((h) => (
                      <span key={h} className={`segmented__opt ${selectedCover.textHAlign === h ? 'active' : ''}`} onClick={() => updateCover(selectedId as 'front' | 'back', { textHAlign: h })}>{h[0].toUpperCase() + h.slice(1)}</span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {selectedSpread && (
              <>
                <div className="zine-field">
                  <label>Layout</label>
                  <div className="segmented">
                    <span className={`segmented__opt ${selectedSpread.spanMode === 'split' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { spanMode: 'split' })}>Two pages</span>
                    <span className={`segmented__opt ${selectedSpread.spanMode === 'span' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { spanMode: 'span' })}>Spans spread</span>
                  </div>
                </div>

                {selectedSpread.spanMode === 'split' && (
                  <>
                    <div className="zine-field">
                      <label>Left page</label>
                      <div className="segmented">
                        {(['portrait', 'landscape1', 'landscape2'] as ImageMode[]).map((m) => (
                          <span key={m} className={`segmented__opt ${selectedSpread.modeL === m ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { modeL: m })}>
                            {m === 'portrait' ? 'Portrait' : m === 'landscape1' ? 'Landscape ×1' : 'Landscape ×2'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Left border</label>
                      <div className="zine-border-row">
                        <input type="color" value={selectedSpread.borderL.color} onChange={(e) => updateSpreadBorder(selectedId, 'borderL', { color: e.target.value })} className="zine-color-input zine-color-input--sm" />
                        <input type="range" min={0} max={30} step={1} value={selectedSpread.borderL.pct} onChange={(e) => updateSpreadBorder(selectedId, 'borderL', { pct: Number(e.target.value) })} className="zine-range zine-range--sm" />
                        <span className="muted" style={{ fontSize: 12 }}>{selectedSpread.borderL.pct}%</span>
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Left fit</label>
                      <div className="segmented">
                        <span className={`segmented__opt ${selectedSpread.fitL === 'cover' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitL: 'cover' })} title="Crop to fill">Fill</span>
                        <span className={`segmented__opt ${selectedSpread.fitL === 'contain' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitL: 'contain' })} title="Show the whole photo">Whole</span>
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Right page</label>
                      <div className="segmented">
                        {(['portrait', 'landscape1', 'landscape2'] as ImageMode[]).map((m) => (
                          <span key={m} className={`segmented__opt ${selectedSpread.modeR === m ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { modeR: m })}>
                            {m === 'portrait' ? 'Portrait' : m === 'landscape1' ? 'Landscape ×1' : 'Landscape ×2'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Right border</label>
                      <div className="zine-border-row">
                        <input type="color" value={selectedSpread.borderR.color} onChange={(e) => updateSpreadBorder(selectedId, 'borderR', { color: e.target.value })} className="zine-color-input zine-color-input--sm" />
                        <input type="range" min={0} max={30} step={1} value={selectedSpread.borderR.pct} onChange={(e) => updateSpreadBorder(selectedId, 'borderR', { pct: Number(e.target.value) })} className="zine-range zine-range--sm" />
                        <span className="muted" style={{ fontSize: 12 }}>{selectedSpread.borderR.pct}%</span>
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Right fit</label>
                      <div className="segmented">
                        <span className={`segmented__opt ${selectedSpread.fitR === 'cover' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitR: 'cover' })} title="Crop to fill">Fill</span>
                        <span className={`segmented__opt ${selectedSpread.fitR === 'contain' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitR: 'contain' })} title="Show the whole photo">Whole</span>
                      </div>
                    </div>
                  </>
                )}

                {selectedSpread.spanMode === 'span' && (
                  <>
                    <div className="zine-field">
                      <label>Spanning image</label>
                      <div className="segmented">
                        <span className={`segmented__opt ${selectedSpread.modeSpan === 'landscape1' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { modeSpan: 'landscape1' })}>1 image</span>
                        <span className={`segmented__opt ${selectedSpread.modeSpan === 'landscape2' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { modeSpan: 'landscape2' })}>2 images stacked</span>
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Border</label>
                      <div className="zine-border-row">
                        <input type="color" value={selectedSpread.borderSpan.color} onChange={(e) => updateSpreadBorder(selectedId, 'borderSpan', { color: e.target.value })} className="zine-color-input zine-color-input--sm" />
                        <input type="range" min={0} max={30} step={1} value={selectedSpread.borderSpan.pct} onChange={(e) => updateSpreadBorder(selectedId, 'borderSpan', { pct: Number(e.target.value) })} className="zine-range zine-range--sm" />
                        <span className="muted" style={{ fontSize: 12 }}>{selectedSpread.borderSpan.pct}%</span>
                      </div>
                    </div>
                    <div className="zine-field">
                      <label>Fit</label>
                      <div className="segmented">
                        <span className={`segmented__opt ${selectedSpread.fitSpan === 'cover' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitSpan: 'cover' })} title="Crop to fill">Fill</span>
                        <span className={`segmented__opt ${selectedSpread.fitSpan === 'contain' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { fitSpan: 'contain' })} title="Show the whole photo">Whole</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {pickerSlot !== null && (() => {
        const usedPhotoIds = new Set(Object.values(slotPhotos));
        const availablePhotos = photos.filter((p) => !usedPhotoIds.has(p.id));
        return (
          <div className="modal-overlay" onClick={() => setPickerSlot(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-card__title">Choose a frame</div>
              <div className="zine-picker-grid">
                {availablePhotos.map((p) => (
                  <button key={p.id} className="zine-picker-tile" onClick={() => assignSlot(pickerSlot, p.id)}>
                    <img src={`/files/thumb/${p.id}`} alt={p.filename} />
                  </button>
                ))}
                {photos.length === 0 && <p className="muted">This project has no frames yet.</p>}
                {photos.length > 0 && availablePhotos.length === 0 && <p className="muted">Every frame is already placed — remove one from a slot to reuse it.</p>}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setPickerSlot(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {exportOpen && (
        <div className="modal-overlay" onClick={() => !exporting && setExportOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__title">Export PDF</div>

            <div className="zine-field">
              <label>Layout</label>
              <div className="segmented">
                <span
                  className={`segmented__opt ${exportMode === 'zine' ? 'active' : ''} ${pageCount !== 8 && pageCount !== 16 ? 'is-disabled' : ''}`}
                  onClick={() => (pageCount === 8 || pageCount === 16) && setExportMode('zine')}
                  title={pageCount === 8 || pageCount === 16 ? undefined : 'Only available at 8 or 16 pages'}
                >
                  Zine (one sheet)
                </span>
                <span className={`segmented__opt ${exportMode === 'booklet' ? 'active' : ''}`} onClick={() => setExportMode('booklet')}>Booklet (fold + staple)</span>
                <span className={`segmented__opt ${exportMode === 'pages' ? 'active' : ''}`} onClick={() => setExportMode('pages')}>Single pages</span>
              </div>
            </div>

            {exportMode === 'zine' && (
              <p className="muted" style={{ margin: 0 }}>
                {pageCount === 8
                  ? `1 landscape ${paperSize} sheet (${PAPER_SIZES[paperSize].hIn}×${PAPER_SIZES[paperSize].wIn}in), single-sided — fold into eighths, cut the center slit, pop into an 8-page booklet.`
                  : `2 landscape ${paperSize} sheets (${PAPER_SIZES[paperSize].hIn}×${PAPER_SIZES[paperSize].wIn}in each), single-sided — fold and cut each sheet the same way into its own 8-page booklet, then nest one inside the other for all 16 pages.`}
              </p>
            )}
            {exportMode === 'booklet' && (
              <p className="muted" style={{ margin: 0 }}>
                {Math.ceil(pageCount / 4)} double-wide {paperSize} sheets ({(PAPER_SIZES[paperSize].wIn * 2).toFixed(2)}×{PAPER_SIZES[paperSize].hIn}in), 2 pages per side, imposed for saddle-stitch
                binding. Print double-sided (flip on short edge), fold the stack once, staple the spine.
                {pageCount % 4 !== 0 && ` (${4 - (pageCount % 4)} blank page${4 - (pageCount % 4) === 1 ? '' : 's'} added at the end to fill the last sheet.)`}
              </p>
            )}
            {exportMode === 'pages' && (
              <p className="muted" style={{ margin: 0 }}>
                {pageCount} {paperSize} sheets, one page per sheet, in reading order — simplest to print, stack, and bind at the edge.
              </p>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => setExportOpen(false)} disabled={exporting}>Close</button>
              <button className="btn btn-solid" onClick={exportPdf} disabled={exporting}>{exporting ? 'Rendering…' : 'Download PDF'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZineImageSlot({ photoId, fit, fillColor, onPick, onClear }: { photoId: number | undefined; fit: ImageFit; fillColor: string; onPick: () => void; onClear: () => void }) {
  if (photoId == null) {
    return (
      <button className="zine-slot zine-slot--empty" onClick={onPick} type="button">
        <span className="zine-slot__plus">+</span>
      </button>
    );
  }
  return (
    <div className="zine-slot zine-slot--filled" style={{ background: fillColor }}>
      <img src={`/files/display/${photoId}`} alt="" onClick={onPick} style={{ objectFit: fit }} />
      <button type="button" className="zine-slot__delete" onClick={(e) => { e.stopPropagation(); onClear(); }} title="Remove image">×</button>
    </div>
  );
}

// ---------- export rendering (canvas, independent of the live DOM preview) ----------

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCoverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  if (dw <= 0 || dh <= 0) return;
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale, sh = dh / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// "Fit" mode — the whole photo stays uncropped, scaled to fit inside the
// slot and centered; whatever margin that leaves is the slot's own border
// color (already painted behind it), matching the live preview's letterbox.
function drawContainFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  if (dw <= 0 || dh <= 0) return;
  const scale = Math.min(dw / img.width, dh / img.height);
  const sw = img.width * scale, sh = img.height * scale;
  const ox = dx + (dw - sw) / 2, oy = dy + (dh - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);
}

function sliceCanvas(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = sw; out.height = sh;
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

interface RenderSpec {
  widthPx: number;
  heightPx: number;
  bgColor: string;
  images: string[];
  imageFit: ImageFit;
  slotPhotos: Record<string, number>;
  borderColor: string;
  borderPct: number;
  overlay?: { header: string; sub1: string; sub2: string; vAlign: VAlign; hAlign: HAlign; font: string; headerSize: number; subSize: number };
}

async function renderPageCanvas(spec: RenderSpec): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = spec.widthPx;
  canvas.height = spec.heightPx;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spec.bgColor;
  ctx.fillRect(0, 0, spec.widthPx, spec.heightPx);

  const n = spec.images.length;
  if (n > 0) {
    const gap = spec.widthPx * 0.006;
    const cellH = n > 1 ? (spec.heightPx - gap * (n - 1)) / n : spec.heightPx;
    for (let i = 0; i < n; i++) {
      const cellY = i * (cellH + gap);
      // CSS `padding: pct%` is always relative to the box's *width*, on every side.
      const padPx = (spec.borderPct / 100) * spec.widthPx;
      ctx.fillStyle = spec.borderColor;
      ctx.fillRect(0, cellY, spec.widthPx, cellH);
      const photoId = spec.slotPhotos[spec.images[i]];
      if (photoId != null) {
        const img = await loadImage(`/files/display/${photoId}`);
        if (img) {
          const draw = spec.imageFit === 'contain' ? drawContainFit : drawCoverFit;
          draw(ctx, img, padPx, cellY + padPx, spec.widthPx - 2 * padPx, cellH - 2 * padPx);
        }
      }
    }
  }

  if (spec.overlay) drawCoverOverlay(ctx, spec.widthPx, spec.heightPx, spec.overlay);

  return canvas;
}

function drawCoverOverlay(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, overlay: NonNullable<RenderSpec['overlay']>) {
  const { header, sub1, sub2, vAlign, hAlign, font, headerSize: headerSizeChoice, subSize: subSizeChoice } = overlay;
  ctx.save();

  if (vAlign === 'top') {
    const g = ctx.createLinearGradient(0, 0, 0, heightPx * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, widthPx, heightPx * 0.55);
  } else if (vAlign === 'bottom') {
    const g = ctx.createLinearGradient(0, heightPx * 0.45, 0, heightPx);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, heightPx * 0.45, widthPx, heightPx * 0.55);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const padding = widthPx * 0.045;
  const textAlign = hAlign === 'left' ? 'left' : hAlign === 'center' ? 'center' : 'right';
  ctx.textAlign = textAlign;
  const x = hAlign === 'left' ? padding : hAlign === 'center' ? widthPx / 2 : widthPx - padding;

  // Base fractions are tuned against the editor's default 28px/15px choices —
  // scale them by how far the user's chosen size is from that default, so
  // export stays proportional to paper width (bigger paper, bigger text)
  // while still respecting the header/subtext size sliders.
  const headerPx = widthPx * 0.09 * (headerSizeChoice / 28);
  const subPx = widthPx * 0.05 * (subSizeChoice / 15);
  const lines: { text: string; size: number; weight: number; color: string }[] = [
    { text: header, size: headerPx, weight: 600, color: '#ffffff' },
    { text: sub1, size: subPx, weight: 400, color: 'rgba(255,255,255,0.85)' },
    { text: sub2, size: subPx, weight: 400, color: 'rgba(255,255,255,0.85)' },
  ].filter((l) => l.text);

  const lineGap = widthPx * 0.02;
  const totalHeight = lines.reduce((h, l) => h + l.size * 1.2, 0) + lineGap * Math.max(0, lines.length - 1);

  let y: number;
  if (vAlign === 'top') y = padding + (lines[0]?.size ?? 0) * 0.9;
  else if (vAlign === 'bottom') y = heightPx - padding - totalHeight + (lines[0]?.size ?? 0) * 0.9;
  else y = heightPx / 2 - totalHeight / 2 + (lines[0]?.size ?? 0) * 0.9;

  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px "${font}", sans-serif`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x, y);
    y += line.size * 1.2 + lineGap;
  }

  ctx.restore();
}
