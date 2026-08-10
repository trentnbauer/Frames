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

interface CoverSettings {
  header: string;
  sub1: string;
  sub2: string;
  imageMode: ImageMode;
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
  borderL: BorderSetting;
  borderR: BorderSetting;
  borderSpan: BorderSetting;
}

const SPREAD_IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
const FONT_CHOICES = ['Inter', 'Playfair Display', 'Bebas Neue', 'Space Mono', 'Courier Prime', 'Poppins'];
const PAPER_SIZES: Record<PaperSize, { wIn: number; hIn: number }> = {
  Letter: { wIn: 8.5, hIn: 11 },
  A4: { wIn: 8.27, hIn: 11.69 },
  A3: { wIn: 11.69, hIn: 16.54 },
  A2: { wIn: 16.54, hIn: 23.39 },
};
const PORTRAIT_ASPECT = 0.7727; // single page, w/h
const SPAN_ASPECT = 1.5454; // two pages side by side, w/h — exactly 2x portrait

function defaultCover(header: string, sub1: string, sub2: string): CoverSettings {
  return { header, sub1, sub2, imageMode: 'portrait', borderPct: 0, borderColor: '#ffffff', bgColor: '#161826', textVAlign: 'bottom', textHAlign: 'left' };
}

function defaultSpread(): SpreadSettings {
  return {
    spanMode: 'split',
    modeL: 'portrait', modeR: 'portrait', modeSpan: 'landscape2',
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

function fullSize(canvasSize: { w: number; h: number }, wide: boolean, count: number) {
  const gap = 10;
  if (wide) {
    let h = canvasSize.h;
    let w = h * SPAN_ASPECT;
    if (w > canvasSize.w) { h = h * (canvasSize.w / w); w = canvasSize.w; }
    return { w, h };
  }
  let h = canvasSize.h;
  const totalW = count * h * PORTRAIT_ASPECT + (count - 1) * gap;
  if (totalW > canvasSize.w) h = h * (canvasSize.w / totalW);
  return { w: h * PORTRAIT_ASPECT, h };
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
  const [pageCount, setPageCount] = useState<8 | 16>(8);
  const [paperSize, setPaperSize] = useState<PaperSize>('Letter');
  const [fontChoice, setFontChoice] = useState('Inter');
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

  function setPageCount8or16(n: 8 | 16) {
    const spreadCount = (n - 2) / 2;
    const visible = ['front', ...SPREAD_IDS.slice(0, spreadCount), 'back'];
    setPageCount(n);
    setSelectedId((cur) => (visible.includes(cur) ? cur : 'front'));
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
    borderColor: string;
    borderPct: number;
    cover?: CoverSettings;
  }

  function canvasPagesForSelected(): PageBox[] {
    const id = selectedId;
    if (isCoverId(id)) {
      const st = coverSettings[id];
      return [{ key: id, size: fullSize(canvasSize, false, 1), bgColor: st.bgColor, images: imageSlotsFor(st.imageMode, `${id}-img`), borderColor: st.borderColor, borderPct: st.borderPct, cover: st }];
    }
    const st = spreadSettings[id];
    if (st.spanMode === 'span') {
      return [{ key: `${id}-span`, size: fullSize(canvasSize, true, 1), bgColor: '#ffffff', images: imageSlotsFor(st.modeSpan, `${id}-span`), borderColor: st.borderSpan.color, borderPct: st.borderSpan.pct }];
    }
    const size = fullSize(canvasSize, false, 2);
    return [
      { key: `${id}-L`, size, bgColor: '#ffffff', images: imageSlotsFor(st.modeL, `${id}-L`), borderColor: st.borderL.color, borderPct: st.borderL.pct },
      { key: `${id}-R`, size, bgColor: '#ffffff', images: imageSlotsFor(st.modeR, `${id}-R`), borderColor: st.borderR.color, borderPct: st.borderR.pct },
    ];
  }

  function thumbBoxesFor(id: string): { style: React.CSSProperties }[] {
    const THUMB_H = 92;
    const box = (aspect: number, bgColor: string): React.CSSProperties => ({
      height: THUMB_H, width: THUMB_H * aspect, background: bgColor, boxSizing: 'border-box',
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--text) 20%, transparent)', borderRadius: 1, flex: 'none',
    });
    if (isCoverId(id)) return [{ style: box(PORTRAIT_ASPECT, coverSettings[id].bgColor) }];
    const st = spreadSettings[id];
    if (st.spanMode === 'span') return [{ style: box(SPAN_ASPECT, '#ffffff') }];
    return [{ style: box(PORTRAIT_ASPECT, '#ffffff') }, { style: box(PORTRAIT_ASPECT, '#ffffff') }];
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

      const pdf = new jsPDF({ unit: 'in', format: [paper.wIn, paper.hIn], orientation: 'portrait' });
      let first = true;
      const addPage = (dataUrl: string) => {
        if (!first) pdf.addPage([paper.wIn, paper.hIn], 'portrait');
        first = false;
        pdf.addImage(dataUrl, 'JPEG', 0, 0, paper.wIn, paper.hIn);
      };

      for (const id of visibleIds()) {
        if (isCoverId(id)) {
          const st = coverSettings[id];
          const canvas = await renderPageCanvas({
            widthPx: wPx, heightPx: hPx, bgColor: st.bgColor, images: imageSlotsFor(st.imageMode, `${id}-img`), slotPhotos,
            borderColor: st.borderColor, borderPct: st.borderPct,
            overlay: { header: st.header, sub1: st.sub1, sub2: st.sub2, vAlign: st.textVAlign, hAlign: st.textHAlign, font: fontChoice },
          });
          addPage(canvas.toDataURL('image/jpeg', 0.92));
        } else {
          const st = spreadSettings[id];
          if (st.spanMode === 'split') {
            const left = await renderPageCanvas({ widthPx: wPx, heightPx: hPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeL, `${id}-L`), slotPhotos, borderColor: st.borderL.color, borderPct: st.borderL.pct });
            addPage(left.toDataURL('image/jpeg', 0.92));
            const right = await renderPageCanvas({ widthPx: wPx, heightPx: hPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeR, `${id}-R`), slotPhotos, borderColor: st.borderR.color, borderPct: st.borderR.pct });
            addPage(right.toDataURL('image/jpeg', 0.92));
          } else {
            const wide = await renderPageCanvas({ widthPx: wPx * 2, heightPx: hPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeSpan, `${id}-span`), slotPhotos, borderColor: st.borderSpan.color, borderPct: st.borderSpan.pct });
            addPage(sliceCanvas(wide, 0, 0, wPx, hPx).toDataURL('image/jpeg', 0.92));
            addPage(sliceCanvas(wide, wPx, 0, wPx, hPx).toDataURL('image/jpeg', 0.92));
          }
        }
      }

      pdf.save(`${(idea?.title || 'zine').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
      showToast('Zine PDF downloaded');
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
          <div className="segmented">
            <span className={`segmented__opt ${pageCount === 8 ? 'active' : ''}`} onClick={() => setPageCount8or16(8)}>8 pages</span>
            <span className={`segmented__opt ${pageCount === 16 ? 'active' : ''}`} onClick={() => setPageCount8or16(16)}>16 pages</span>
          </div>
          <div className="segmented">
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
              <span key={size} className={`segmented__opt ${paperSize === size ? 'active' : ''}`} onClick={() => setPaperSize(size)}>{size}</span>
            ))}
          </div>
          <select className="field-input" style={{ width: 'auto' }} value={fontChoice} onChange={(e) => setFontChoice(e.target.value)}>
            {FONT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button className="btn btn-solid" onClick={() => setExportOpen(true)}>Export PDF</button>
        </div>
      </nav>

      <div className="zine-creator__body">
        <div className="zine-creator__thumbs">
          {visibleIds().map((id) => (
            <div key={id} className={`zine-thumb ${selectedId === id ? 'is-selected' : ''}`} onClick={() => setSelectedId(id)}>
              <div className="zine-thumb__boxes">
                {thumbBoxesFor(id).map((b, i) => <div key={i} style={b.style} />)}
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
                      <div style={{ color: '#fff', fontFamily: `"${fontChoice}", sans-serif`, fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>{p.cover.header}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: 15, lineHeight: 1.3 }}>{p.cover.sub1}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: 15, lineHeight: 1.3 }}>{p.cover.sub2}</div>
                    </div>
                  )}
                  {p.images.map((slotKey) => (
                    <div key={slotKey} className="zine-slot-wrap" style={{ padding: `${p.borderPct}%`, background: p.borderColor }}>
                      <ZineImageSlot photoId={slotPhotos[slotKey]} onPick={() => setPickerSlot(slotKey)} onClear={() => clearSlot(slotKey)} />
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
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {pickerSlot !== null && (
        <div className="modal-overlay" onClick={() => setPickerSlot(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__title">Choose a frame</div>
            <div className="zine-picker-grid">
              {photos.map((p) => (
                <button key={p.id} className="zine-picker-tile" onClick={() => assignSlot(pickerSlot, p.id)}>
                  <img src={`/files/thumb/${p.id}`} alt={p.filename} />
                </button>
              ))}
              {photos.length === 0 && <p className="muted">This project has no frames yet.</p>}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setPickerSlot(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="modal-overlay" onClick={() => !exporting && setExportOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__title">Export {paperSize} PDF</div>
            <p className="muted" style={{ margin: 0 }}>{pageCount}-page zine, {paperSize} sheets, ready to lay out and print.</p>
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

function ZineImageSlot({ photoId, onPick, onClear }: { photoId: number | undefined; onPick: () => void; onClear: () => void }) {
  if (photoId == null) {
    return (
      <button className="zine-slot zine-slot--empty" onClick={onPick} type="button">
        <span className="zine-slot__plus">+</span>
      </button>
    );
  }
  return (
    <div className="zine-slot zine-slot--filled">
      <img src={`/files/display/${photoId}`} alt="" onClick={onPick} />
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
  slotPhotos: Record<string, number>;
  borderColor: string;
  borderPct: number;
  overlay?: { header: string; sub1: string; sub2: string; vAlign: VAlign; hAlign: HAlign; font: string };
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
        if (img) drawCoverFit(ctx, img, padPx, cellY + padPx, spec.widthPx - 2 * padPx, cellH - 2 * padPx);
      }
    }
  }

  if (spec.overlay) drawCoverOverlay(ctx, spec.widthPx, spec.heightPx, spec.overlay);

  return canvas;
}

function drawCoverOverlay(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, overlay: NonNullable<RenderSpec['overlay']>) {
  const { header, sub1, sub2, vAlign, hAlign, font } = overlay;
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

  const headerSize = widthPx * 0.09;
  const subSize = widthPx * 0.05;
  const lines: { text: string; size: number; weight: number; color: string }[] = [
    { text: header, size: headerSize, weight: 600, color: '#ffffff' },
    { text: sub1, size: subSize, weight: 400, color: 'rgba(255,255,255,0.85)' },
    { text: sub2, size: subSize, weight: 400, color: 'rgba(255,255,255,0.85)' },
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
