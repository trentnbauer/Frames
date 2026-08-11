import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import type { Idea, IdeaPhoto } from '../types.js';
import { useEscapeKey } from '../useEscapeKey.js';
import { useToast } from '../toast.js';
import { configReady, getSocialHandles } from '../importConfig.js';

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
// Bottom-left social-handles badge sits in the same corner a bottom+left
// cover text alignment naturally lands in — when both are active on the
// same cover, the bottom-aligned text needs this much extra clearance
// (as a fraction of page height) so the two don't render on top of each
// other. Applied identically in the live preview and canvas export.
const SOCIAL_BADGE_RESERVE_FRAC = 0.09;
const SPREAD_IDS = Array.from({ length: (MAX_PAGE_COUNT - 2) / 2 }, (_, i) => `s${i + 1}`);
// Every slot key a spread can own, minus its `${id}-` prefix — used to
// move a spread's photo placements between buckets on duplicate.
const SLOT_SUFFIXES = ['L-0', 'R-0', 'span-0', 'span-1'];
const FONT_CHOICES = ['Inter', 'Playfair Display', 'Bebas Neue', 'Space Mono', 'Courier Prime', 'Poppins'];
const PAPER_SIZES: Record<PaperSize, { wIn: number; hIn: number }> = {
  Letter: { wIn: 8.5, hIn: 11 },
  A4: { wIn: 8.27, hIn: 11.69 },
  A3: { wIn: 11.69, hIn: 16.54 },
  A2: { wIn: 16.54, hIn: 23.39 },
};
// Picture-based layout picker (cover Image / spread Left/Right/Spanning
// image) — replaces a text segmented control ("Portrait" / "Landscape ×1" /
// "Landscape ×2") with icon tiles that show the layout directly. Deliberately
// only 4 icons for the 4 real ImageMode values (no separate "stacked" icon
// for landscape2) — that distinction doesn't exist as a real mode, and an
// icon suggesting it would promise behavior the app doesn't have.
const IMAGE_MODE_LABELS: Record<ImageMode, string> = {
  none: 'No image',
  portrait: 'Portrait',
  landscape1: 'Landscape ×1',
  landscape2: 'Landscape ×2',
};

function ImageModeIcon({ mode }: { mode: ImageMode }) {
  if (mode === 'none') return <span className="zine-mode-tile__icon zine-mode-tile__icon--none" />;
  if (mode === 'landscape2') {
    return (
      <span className="zine-mode-tile__icon-row">
        <span className="zine-mode-tile__icon zine-mode-tile__icon--bar" />
        <span className="zine-mode-tile__icon zine-mode-tile__icon--bar" />
      </span>
    );
  }
  return <span className={`zine-mode-tile__icon zine-mode-tile__icon--${mode}`} />;
}

function ModePicker({ value, onChange, options }: { value: ImageMode; onChange: (m: ImageMode) => void; options: ImageMode[] }) {
  return (
    <div className="zine-mode-picker">
      {options.map((m) => (
        <button
          key={m}
          type="button"
          className={`zine-mode-tile ${value === m ? 'is-active' : ''}`}
          onClick={() => onChange(m)}
          title={IMAGE_MODE_LABELS[m]}
        >
          <ImageModeIcon mode={m} />
        </button>
      ))}
    </div>
  );
}

// One 3×3 grid replaces the old two separate vertical/horizontal segmented
// rows — a position is a single click instead of two.
const TEXT_POSITIONS: { v: VAlign; h: HAlign }[] = [
  { v: 'top', h: 'left' }, { v: 'top', h: 'center' }, { v: 'top', h: 'right' },
  { v: 'middle', h: 'left' }, { v: 'middle', h: 'center' }, { v: 'middle', h: 'right' },
  { v: 'bottom', h: 'left' }, { v: 'bottom', h: 'center' }, { v: 'bottom', h: 'right' },
];

function TextPositionGrid({ vAlign, hAlign, onChange }: { vAlign: VAlign; hAlign: HAlign; onChange: (v: VAlign, h: HAlign) => void }) {
  return (
    <div className="zine-pos-grid">
      {TEXT_POSITIONS.map(({ v, h }) => (
        <button
          key={`${v}-${h}`}
          type="button"
          className={`zine-pos-cell ${vAlign === v && hAlign === h ? 'is-active' : ''}`}
          onClick={() => onChange(v, h)}
          title={`${v} ${h}`}
        />
      ))}
    </div>
  );
}

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

// Everything needed to resume editing later — deliberately excludes purely
// transient UI state (selectedId, which modal is open, measured canvas size).
// Serialized as opaque JSON into ideas.zine_state; bump `version` if the
// shape ever changes in a way old saves can't just be spread over.
interface ZinePersistedState {
  version: 1;
  pageCount: number;
  paperSize: PaperSize;
  fontChoice: string;
  headerSize: number;
  subSize: number;
  showSocialHandles: boolean;
  exportMode: 'pages' | 'booklet' | 'zine';
  coverSettings: { front: CoverSettings; back: CoverSettings };
  spreadSettings: Record<string, SpreadSettings>;
  slotPhotos: Record<string, number>;
  slotTransforms: Record<string, SlotTransform>;
  // Which spread bucket (s1, s2, ...) shows at each visible position —
  // reordering/duplicating spreads permutes this without touching the
  // buckets' own settings/photos. Missing on saves from before this
  // existed; hydration falls back to the natural s1..sN order.
  spreadOrder?: string[];
}

// A reusable layout starting point — deliberately excludes slotPhotos/
// slotTransforms (photo picks are specific to one project's frames) and
// showSocialHandles (a personal-account toggle, not a layout choice).
// Stored client-side (localStorage), not per-project, since a template is
// meant to be applied across different projects.
interface ZineTemplate {
  id: string;
  name: string;
  createdAt: string;
  pageCount: number;
  paperSize: PaperSize;
  fontChoice: string;
  headerSize: number;
  subSize: number;
  exportMode: 'pages' | 'booklet' | 'zine';
  coverSettings: { front: CoverSettings; back: CoverSettings };
  spreadSettings: Record<string, SpreadSettings>;
  spreadOrder: string[];
}

const TEMPLATES_KEY = 'frames-zine-templates';
function loadTemplates(): ZineTemplate[] {
  try {
    const v = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveTemplatesToStorage(templates: ZineTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

// Everything undo/redo and autosave track together as one unit — the
// "document," as opposed to purely transient UI state (selectedId, which
// modal is open, measured canvas size). Same shape as the persisted-save
// fields (minus the version tag) plus spreadOrder, which always exists at
// runtime even though it's optional in a stored save.
interface ZineDoc {
  pageCount: number;
  paperSize: PaperSize;
  fontChoice: string;
  headerSize: number;
  subSize: number;
  showSocialHandles: boolean;
  exportMode: 'pages' | 'booklet' | 'zine';
  coverSettings: { front: CoverSettings; back: CoverSettings };
  spreadSettings: Record<string, SpreadSettings>;
  slotPhotos: Record<string, number>;
  slotTransforms: Record<string, SlotTransform>;
  spreadOrder: string[];
}

const HISTORY_LIMIT = 50;
const HISTORY_BURST_MS = 400;
const AUTOSAVE_DEBOUNCE_MS = 2500;

function nextUnusedSpreadId(order: string[]): string {
  const found = SPREAD_IDS.find((sid) => !order.includes(sid));
  if (!found) throw new Error('No spread slots left');
  return found;
}

// Per-slot pan/zoom for "Fill" (cover-fit) photos — ox/oy shift the crop
// window as a fraction of the image's own size (0 = centered, clamped to
// ±0.4 so the crop can't pan entirely off the image), zoom magnifies on
// top of the base cover-fit scale. "Whole photo" (contain) mode always
// shows the full image, so it has nothing to pan/zoom. rotation/brightness/
// contrast/saturate are basic per-slot edits; caption is a text band that
// reserves space above or below the photo rather than overlapping it (the
// image's own area shrinks — see ZineImageSlot's flex-column layout and
// renderPageCanvas's matching capH reservation on export).
interface SlotTransform {
  ox: number;
  oy: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  brightness: number; // percent; 100 = unchanged
  contrast: number;
  saturate: number;
  caption: string;
  captionPosition: 'above' | 'below';
}
const DEFAULT_TRANSFORM: SlotTransform = {
  ox: 0, oy: 0, zoom: 1, rotation: 0, brightness: 100, contrast: 100, saturate: 100, caption: '', captionPosition: 'below',
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
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

function overlayStyle(vAlign: VAlign, hAlign: HAlign, extraBottomPx = 0): React.CSSProperties {
  const justifyContent = vAlign === 'top' ? 'flex-start' : vAlign === 'middle' ? 'center' : 'flex-end';
  const alignItems = hAlign === 'left' ? 'flex-start' : hAlign === 'center' ? 'center' : 'flex-end';
  const background =
    vAlign === 'top'
      ? 'linear-gradient(to bottom, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)'
      : vAlign === 'middle'
        ? 'rgba(0,0,0,.38)'
        : 'linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)';
  return {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent, alignItems, textAlign: hAlign, gap: 8,
    padding: 28, paddingBottom: vAlign === 'bottom' ? 28 + extraBottomPx : 28,
    pointerEvents: 'none', background, zIndex: 1,
  };
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
  const [socialHandles, setSocialHandlesState] = useState(() => getSocialHandles());
  useEffect(() => {
    configReady.then(() => setSocialHandlesState(getSocialHandles()));
  }, []);
  const [showSocialHandles, setShowSocialHandles] = useState(true);
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
  const [spreadOrder, setSpreadOrder] = useState<string[]>(() => SPREAD_IDS.slice(0, (8 - 2) / 2));
  const [slotPhotos, setSlotPhotos] = useState<Record<string, number>>({});
  const [slotTransforms, setSlotTransforms] = useState<Record<string, SlotTransform>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<ZineTemplate[]>(() => loadTemplates());
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [exportMode, setExportMode] = useState<'pages' | 'booklet' | 'zine'>('zine');
  const [exporting, setExporting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showDocSettings, setShowDocSettings] = useState(false);
  const [history, setHistory] = useState<{ past: ZineDoc[]; future: ZineDoc[] }>({ past: [], future: [] });
  const showToast = useToast();

  // Autosave already covers "did my edit get saved" — a visible Save button
  // next to Export invited a wrong click before exporting, so it's replaced
  // with a passive "Saved Ns ago" status that needs its own ticking clock.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // A callback ref, not useRef — this component returns null while `idea`
  // is still loading, so the canvas-measure div doesn't exist on first
  // commit. A plain useRef + `useEffect(..., [])` would attach its
  // ResizeObserver to a null element on that first pass and then never
  // retry once the real DOM mounts on a later render, leaving canvasSize
  // stuck at its fallback default forever (the page would then render at
  // that fallback's aspect-correct but wildly wrong absolute size). A
  // callback ref fires exactly when the node actually mounts/unmounts.
  const canvasRef = useCallback((el: HTMLDivElement | null) => setCanvasEl(el), []);

  // Undo/redo and autosave both watch this one combined snapshot instead of
  // each of the ~11 underlying fields separately. useMemo keeps the same
  // object reference across renders where none of the fields changed, so
  // effects keyed on [doc] only fire on a genuine edit.
  const doc: ZineDoc = useMemo(
    () => ({ pageCount, paperSize, fontChoice, headerSize, subSize, showSocialHandles, exportMode, coverSettings, spreadSettings, slotPhotos, slotTransforms, spreadOrder }),
    [pageCount, paperSize, fontChoice, headerSize, subSize, showSocialHandles, exportMode, coverSettings, spreadSettings, slotPhotos, slotTransforms, spreadOrder]
  );

  function applyDoc(d: ZineDoc) {
    setPageCountState(d.pageCount);
    setPaperSize(d.paperSize);
    setFontChoice(d.fontChoice);
    setHeaderSize(d.headerSize);
    setSubSize(d.subSize);
    setShowSocialHandles(d.showSocialHandles);
    setExportMode(d.exportMode);
    setCoverSettings(d.coverSettings);
    setSpreadSettings(d.spreadSettings);
    setSlotPhotos(d.slotPhotos);
    setSlotTransforms(d.slotTransforms);
    setSpreadOrder(d.spreadOrder);
  }

  // Guards a doc change that was caused by applyDoc itself (undo/redo, or
  // hydrating a saved zine on load) so it doesn't get recorded as a new
  // history entry or treated as a fresh edit burst.
  const isRestoring = useRef(false);
  const prevDocRef = useRef(doc);
  const burstActiveRef = useRef(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isRestoring.current) {
      isRestoring.current = false;
      prevDocRef.current = doc;
      return;
    }
    if (!burstActiveRef.current) {
      // First edit after a quiet period: commit the pre-edit state as an
      // undo point immediately, so undo is available right away rather
      // than only after the user pauses.
      setHistory((h) => ({ past: [...h.past.slice(-(HISTORY_LIMIT - 1)), prevDocRef.current], future: [] }));
      burstActiveRef.current = true;
    }
    clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => { burstActiveRef.current = false; }, HISTORY_BURST_MS);
    prevDocRef.current = doc;
  }, [doc]);

  function undo() {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [doc, ...h.future] }));
    isRestoring.current = true;
    applyDoc(prev);
  }

  function redo() {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory((h) => ({ past: [...h.past, doc], future: h.future.slice(1) }));
    isRestoring.current = true;
    applyDoc(next);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function persistZine(opts: { toast: boolean }) {
    if (!idea) return;
    setSaveState('saving');
    const state: ZinePersistedState = {
      version: 1, pageCount, paperSize, fontChoice, headerSize, subSize, showSocialHandles, exportMode,
      coverSettings, spreadSettings, slotPhotos, slotTransforms, spreadOrder,
    };
    api.ideas
      .update(idea.id, { zine_state: JSON.stringify(state) })
      .then(() => {
        setSaveState('saved');
        setLastSavedAt(Date.now());
        setNowTick(Date.now());
        if (opts.toast) showToast('Zine saved — pick up where you left off later');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      })
      .catch(() => {
        setSaveState('idle');
        if (opts.toast) showToast('Failed to save zine');
      });
  }

  const loadedRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!loadedRef.current) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => persistZine({ toast: false }), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(autosaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => {
    setHistory({ past: [], future: [] });
    loadedRef.current = false;
    api.ideas.get(projectId).then((res) => {
      setIdea(res.idea);
      setPhotos(res.photos);
      if (res.idea.zine_state) {
        try {
          const s = JSON.parse(res.idea.zine_state) as ZinePersistedState;
          isRestoring.current = true;
          setPageCountState(s.pageCount);
          setPaperSize(s.paperSize);
          setFontChoice(s.fontChoice);
          setHeaderSize(s.headerSize);
          setSubSize(s.subSize);
          setShowSocialHandles(s.showSocialHandles);
          setExportMode(s.exportMode);
          setCoverSettings(s.coverSettings);
          setSpreadSettings(s.spreadSettings);
          setSlotPhotos(s.slotPhotos);
          setSlotTransforms(s.slotTransforms);
          setSpreadOrder(s.spreadOrder ?? SPREAD_IDS.slice(0, (s.pageCount - 2) / 2));
        } catch {
          // Corrupt or pre-versioning saved state — ignore, start fresh.
        }
      }
      loadedRef.current = true;
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
    if (!canvasEl) return;
    const measure = () => {
      const r = canvasEl.getBoundingClientRect();
      setCanvasSize((s) => (Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1 ? { w: r.width, h: r.height } : s));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(canvasEl);
    measure();
    return () => ro.disconnect();
  }, [canvasEl]);

  useEscapeKey(pickerSlot !== null, () => setPickerSlot(null));
  useEscapeKey(exportOpen, () => setExportOpen(false));
  useEscapeKey(mobileSetupOpen, () => setMobileSetupOpen(false));
  useEscapeKey(templatesOpen, () => setTemplatesOpen(false));

  function visibleIds(): string[] {
    const n = (pageCount - 2) / 2;
    return ['front', ...spreadOrder.slice(0, n), 'back'];
  }

  function spreadLabel(id: string): string {
    const idx = spreadOrder.indexOf(id);
    const start = 2 + idx * 2;
    return `${start}–${start + 1}`;
  }

  // Page count always moves in steps of 4 — every export mode needs that:
  // booklet imposition holds exactly 4 pages per sheet, and the one-sheet
  // "Zine" fold only exists at 8 or 16 (see below). Zine is auto-selected
  // whenever the count lands on one of those two; anything else falls back
  // to Booklet, per the user's own rule ("8 or 16 gets a zine, anything
  // else defaults to booklet") — still overridable by hand afterward.
  // (Duplicating a single spread moves the count by 2 instead of 4 — see
  // duplicateSpread — so this can't assume n is always a multiple of 4.)
  function applyPageCount(n: number) {
    const spreadCount = (n - 2) / 2;
    const visible = ['front', ...spreadOrder.slice(0, spreadCount), 'back'];
    setSpreadOrder((order) => {
      if (spreadCount <= order.length) return order.slice(0, spreadCount);
      const next = [...order];
      while (next.length < spreadCount) next.push(nextUnusedSpreadId(next));
      return next;
    });
    setPageCountState(n);
    setSelectedId((cur) => (visible.includes(cur) ? cur : 'front'));
    if (n === 8 || n === 16) {
      setExportMode('zine');
    } else {
      setExportMode((mode) => (mode === 'zine' ? 'booklet' : mode));
    }
  }

  function changePageCount(delta: number) {
    applyPageCount(clamp(pageCount + delta, MIN_PAGE_COUNT, MAX_PAGE_COUNT));
  }

  // Swaps a spread with its immediate neighbor in reading order. Only the
  // *order* changes — the spread's own settings and photo placements stay
  // in their original bucket (s1, s2, ...) and just get shown at a
  // different position, so nothing needs to be copied.
  function moveSpread(id: string, dir: -1 | 1) {
    setSpreadOrder((order) => {
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return order;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // Inserts a copy of a spread right after itself: settings and photo
  // placements are copied into a fresh, previously-unused bucket, and the
  // page count grows by 2 (one spread) rather than the usual step of 4.
  function duplicateSpread(id: string) {
    if (pageCount >= MAX_PAGE_COUNT) {
      showToast('Reached the maximum page count');
      return;
    }
    const newId = nextUnusedSpreadId(spreadOrder);
    const i = spreadOrder.indexOf(id);
    const nextOrder = [...spreadOrder];
    nextOrder.splice(i + 1, 0, newId);
    setSpreadOrder(nextOrder);
    setSpreadSettings((s) => ({ ...s, [newId]: { ...s[id] } }));
    setSlotPhotos((p) => {
      const next = { ...p };
      for (const suffix of SLOT_SUFFIXES) {
        const oldKey = `${id}-${suffix}`;
        if (oldKey in p) next[`${newId}-${suffix}`] = p[oldKey];
      }
      return next;
    });
    setSlotTransforms((t) => {
      const next = { ...t };
      for (const suffix of SLOT_SUFFIXES) {
        const oldKey = `${id}-${suffix}`;
        if (oldKey in t) next[`${newId}-${suffix}`] = t[oldKey];
      }
      return next;
    });
    const n = pageCount + 2;
    setPageCountState(n);
    setSelectedId(newId);
    if (n !== 8 && n !== 16 && exportMode === 'zine') setExportMode('booklet');
  }

  // Fills every currently-empty slot, front cover to back cover, with
  // frames from the project's pool that aren't already placed anywhere —
  // a fast first pass before manually swapping specific photos in.
  function autoFillSlots() {
    const usedPhotoIds = new Set(Object.values(slotPhotos));
    const availablePhotos = photos.filter((p) => !usedPhotoIds.has(p.id));
    const allSlotKeys: string[] = [];
    for (const id of visibleIds()) {
      if (isCoverId(id)) {
        const st = coverSettings[id];
        allSlotKeys.push(...imageSlotsFor(st.imageMode, `${id}-img`));
      } else {
        const st = spreadSettings[id];
        if (st.spanMode === 'span') allSlotKeys.push(...imageSlotsFor(st.modeSpan, `${id}-span`));
        else {
          allSlotKeys.push(...imageSlotsFor(st.modeL, `${id}-L`));
          allSlotKeys.push(...imageSlotsFor(st.modeR, `${id}-R`));
        }
      }
    }
    const emptySlots = allSlotKeys.filter((k) => slotPhotos[k] == null);
    if (emptySlots.length === 0) {
      showToast('Every slot already has a frame');
      return;
    }
    if (availablePhotos.length === 0) {
      showToast('No unplaced frames left to auto-fill with');
      return;
    }
    const n = Math.min(emptySlots.length, availablePhotos.length);
    setSlotPhotos((s) => {
      const next = { ...s };
      for (let i = 0; i < n; i++) next[emptySlots[i]] = availablePhotos[i].id;
      return next;
    });
    showToast(`Filled ${n} empty slot${n === 1 ? '' : 's'} with unplaced frames`);
  }

  function saveAsTemplate() {
    const name = templateNameInput.trim();
    if (!name) {
      showToast('Give the template a name first');
      return;
    }
    const t: ZineTemplate = {
      id: `t${Date.now()}`, name, createdAt: new Date().toISOString(),
      pageCount, paperSize, fontChoice, headerSize, subSize, exportMode,
      coverSettings, spreadSettings, spreadOrder,
    };
    setTemplates((ts) => {
      const next = [...ts, t];
      saveTemplatesToStorage(next);
      return next;
    });
    setTemplateNameInput('');
    showToast(`Saved template "${name}"`);
  }

  function applyTemplate(t: ZineTemplate) {
    setPageCountState(t.pageCount);
    setPaperSize(t.paperSize);
    setFontChoice(t.fontChoice);
    setHeaderSize(t.headerSize);
    setSubSize(t.subSize);
    setExportMode(t.exportMode);
    setCoverSettings(t.coverSettings);
    setSpreadSettings(t.spreadSettings);
    setSpreadOrder(t.spreadOrder);
    // A template is a layout/style starting point, not a specific
    // project's photo picks — deliberately leaves photos out, and this is
    // safe to do destructively since it's a single Ctrl+Z away either way.
    setSlotPhotos({});
    setSlotTransforms({});
    setSelectedId('front');
    setTemplatesOpen(false);
    showToast(`Applied template "${t.name}" — Ctrl+Z to undo`);
  }

  function deleteTemplate(id: string) {
    setTemplates((ts) => {
      const next = ts.filter((t) => t.id !== id);
      saveTemplatesToStorage(next);
      return next;
    });
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
    setSlotTransforms((s) => {
      if (!(slotKey in s)) return s;
      const next = { ...s };
      delete next[slotKey];
      return next;
    });
  }

  function assignSlot(slotKey: string, photoId: number) {
    setSlotPhotos((s) => ({ ...s, [slotKey]: photoId }));
    setPickerSlot(null);
  }

  // Merges over DEFAULT_TRANSFORM rather than falling back to it wholesale —
  // a save made before rotation/filters/caption existed has a real (partial)
  // stored object, not nothing, and returning it as-is would leave those
  // newer fields `undefined` instead of at their defaults.
  function getTransform(slotKey: string): SlotTransform {
    return { ...DEFAULT_TRANSFORM, ...slotTransforms[slotKey] };
  }

  function updateTransform(slotKey: string, patch: Partial<SlotTransform>) {
    setSlotTransforms((s) => ({ ...s, [slotKey]: { ...DEFAULT_TRANSFORM, ...s[slotKey], ...patch } }));
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
        widthPx, heightPx, bgColor: st.bgColor, images: imageSlotsFor(st.imageMode, `${owner.id}-img`), imageFit: st.imageFit, slotPhotos, slotTransforms,
        borderColor: st.borderColor, borderPct: st.borderPct,
        overlay: { header: st.header, sub1: st.sub1, sub2: st.sub2, vAlign: st.textVAlign, hAlign: st.textHAlign, font: fontChoice, headerSize, subSize },
        socialHandles: owner.id === 'back' && showSocialHandles ? socialHandles : undefined,
      });
    }
    const st = spreadSettings[owner.id];
    if (owner.part === 'L') return renderPageCanvas({ widthPx, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeL, `${owner.id}-L`), imageFit: st.fitL, slotPhotos, slotTransforms, borderColor: st.borderL.color, borderPct: st.borderL.pct });
    if (owner.part === 'R') return renderPageCanvas({ widthPx, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeR, `${owner.id}-R`), imageFit: st.fitR, slotPhotos, slotTransforms, borderColor: st.borderR.color, borderPct: st.borderR.pct });

    const cacheKey = `${owner.id}-${widthPx}x${heightPx}`;
    let wide = wideCache.get(cacheKey);
    if (!wide) {
      wide = await renderPageCanvas({ widthPx: widthPx * 2, heightPx, bgColor: '#ffffff', images: imageSlotsFor(st.modeSpan, `${owner.id}-span`), imageFit: st.fitSpan, slotPhotos, slotTransforms, borderColor: st.borderSpan.color, borderPct: st.borderSpan.pct });
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
            const blankCtx = blank.getContext('2d')!;
            blankCtx.fillStyle = '#ffffff';
            blankCtx.fillRect(0, 0, wPx, hPx);
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

  // Header/subtext size (H/S) moved out of here into the cover panel's Text
  // section, alongside the header/subtext content fields they size — this
  // popover now only holds true document-level settings (page count, paper,
  // font), matching the "A4 · 8 pages · Inter ▾" summary that triggers it.
  function renderSetupControls() {
    return (
      <>
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
      </>
    );
  }

  function saveStatusLabel(): string | null {
    if (saveState === 'saving') return 'Saving…';
    if (lastSavedAt == null) return null;
    const diffSec = Math.max(0, Math.round((nowTick - lastSavedAt) / 1000));
    if (diffSec < 5) return 'Saved just now';
    if (diffSec < 60) return `Saved ${diffSec}s ago`;
    const diffMin = Math.round(diffSec / 60);
    return `Saved ${diffMin} min ago`;
  }

  return (
    <div className="zine-creator">
      <nav className="zine-creator__nav">
        <button className="back-link zine-creator__back" onClick={onExit} title={idea.title}>
          <span aria-hidden="true">←</span>
          <span className="zine-creator__back-label">{idea.title}</span>
        </button>
        <span className="zine-creator__brand">Zine</span>

        {/* Document settings (page count, paper, font) collapse into one
            summary control — this used to be 5 separate always-visible
            controls sharing the toolbar with every action button. */}
        <div className="zine-creator__setup-inline zine-doc-settings">
          <button type="button" className="btn zine-doc-settings__summary" onClick={() => setShowDocSettings((v) => !v)}>
            {paperSize} · {pageCount} pages · {fontChoice} <span aria-hidden="true">▾</span>
          </button>
          {showDocSettings && (
            <>
              <div className="import-menu__backdrop" onClick={() => setShowDocSettings(false)} />
              <div className="zine-doc-settings__dropdown" onClick={(e) => e.stopPropagation()}>
                {renderSetupControls()}
              </div>
            </>
          )}
        </div>
        <button type="button" className="zine-creator__setup-toggle" onClick={() => setMobileSetupOpen(true)} title="Zine settings">⚙ Settings</button>

        <div className="zine-creator__nav-controls">
          <div className="zine-undo-group">
            <button type="button" className="btn" onClick={undo} disabled={history.past.length === 0} title="Undo (Ctrl+Z)">↺</button>
            <button type="button" className="btn" onClick={redo} disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)">↻</button>
          </div>
          <button type="button" className="btn" onClick={autoFillSlots} title="Fill every empty slot with unplaced frames">Auto-fill</button>
          <button type="button" className="btn" onClick={() => setTemplatesOpen(true)}>Templates</button>
          {/* Autosave already runs — a Save button next to Export invited a
              wrong click before exporting, so it's a passive status instead. */}
          {saveStatusLabel() && <span className="zine-save-status">{saveStatusLabel()}</span>}
          <button className="btn btn-solid" onClick={() => setExportOpen(true)}>Export PDF</button>
        </div>
      </nav>

      <div className="zine-creator__body">
        <div className="zine-creator__thumbs">
          {visibleIds().map((id) => {
            const isSpread = !isCoverId(id);
            const posInOrder = isSpread ? spreadOrder.indexOf(id) : -1;
            return (
              <div key={id} className={`zine-thumb ${selectedId === id ? 'is-selected' : ''}`} onClick={() => setSelectedId(id)}>
                <div className="zine-thumb__boxes">
                  {thumbBoxesFor(id).map((b, i) => (
                    <div key={i} style={b.style}>
                      {b.photoId != null && <img src={`/files/thumb/${b.photoId}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                  ))}
                </div>
                <div className="zine-thumb__label">{id === 'front' ? 'Front' : id === 'back' ? 'Back' : `Pages ${spreadLabel(id)}`}</div>
                {isSpread && (
                  <div className="zine-thumb__actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => moveSpread(id, -1)} disabled={posInOrder <= 0} title="Move earlier">‹</button>
                    <button type="button" onClick={() => duplicateSpread(id)} disabled={pageCount >= MAX_PAGE_COUNT} title="Duplicate">⧉</button>
                    <button type="button" onClick={() => moveSpread(id, 1)} disabled={posInOrder >= spreadOrder.length - 1} title="Move later">›</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="zine-creator__main">
          <div className="zine-creator__canvas-wrap">
            <div ref={canvasRef} className="zine-creator__canvas-measure">
              {pageBoxes.map((p) => (
                <div key={p.key} className="zine-page" style={{ width: p.size.w, height: p.size.h, background: p.bgColor, flexDirection: p.images.length > 1 ? 'column' : 'row' }}>
                  {p.cover && (
                    <div style={overlayStyle(p.cover.textVAlign, p.cover.textHAlign, p.key === 'back' && showSocialHandles && socialHandles.length > 0 && p.cover.textHAlign === 'left' ? p.size.h * SOCIAL_BADGE_RESERVE_FRAC : 0)}>
                      <div style={{ color: '#fff', fontFamily: `"${fontChoice}", sans-serif`, fontSize: headerSize, fontWeight: 600, lineHeight: 1.2 }}>{p.cover.header}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: subSize, lineHeight: 1.3 }}>{p.cover.sub1}</div>
                      <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: `"${fontChoice}", sans-serif`, fontSize: subSize, lineHeight: 1.3 }}>{p.cover.sub2}</div>
                    </div>
                  )}
                  {p.images.map((slotKey) => (
                    <div key={slotKey} className="zine-slot-wrap" style={{ padding: `${p.borderPct}%`, background: p.borderColor }}>
                      <ZineImageSlot
                        photoId={slotPhotos[slotKey]}
                        fit={p.imageFit}
                        fillColor={p.borderColor}
                        transform={getTransform(slotKey)}
                        onPick={() => setPickerSlot(slotKey)}
                        onClear={() => clearSlot(slotKey)}
                        onTransformChange={(patch) => updateTransform(slotKey, patch)}
                      />
                    </div>
                  ))}
                  {p.images.length === 0 && <div className="zine-slot-empty">No image</div>}
                  {p.key === 'back' && showSocialHandles && socialHandles.length > 0 && (
                    <div className="zine-social-handles">{socialHandles.join('  ·  ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="zine-creator__panel">
            <div className="zine-creator__panel-title">{selectedIsCover ? (selectedId === 'front' ? 'Front cover' : 'Back cover') : `Pages ${spreadLabel(selectedId)}`}</div>

            {selectedCover && (
              <>
                <div className="zine-creator__panel-group">Text</div>
                <div className="modal-field zine-field-sm"><label>Header</label><input value={selectedCover.header} onChange={(e) => updateCover(selectedId as 'front' | 'back', { header: e.target.value })} /></div>
                <div className="modal-field zine-field-sm"><label>Subtext</label><input value={selectedCover.sub1} onChange={(e) => updateCover(selectedId as 'front' | 'back', { sub1: e.target.value })} /></div>
                <div className="modal-field zine-field-sm"><label>Subtext</label><input value={selectedCover.sub2} onChange={(e) => updateCover(selectedId as 'front' | 'back', { sub2: e.target.value })} /></div>
                <div className="zine-field">
                  <label>Position</label>
                  <TextPositionGrid
                    vAlign={selectedCover.textVAlign}
                    hAlign={selectedCover.textHAlign}
                    onChange={(v, h) => updateCover(selectedId as 'front' | 'back', { textVAlign: v, textHAlign: h })}
                  />
                </div>
                <label className="zine-size-input" title="Header size">
                  H
                  <input type="number" min={12} max={80} value={headerSize} onChange={(e) => setHeaderSize(Number(e.target.value) || 28)} />
                </label>
                <label className="zine-size-input" title="Subtext size">
                  S
                  <input type="number" min={8} max={40} value={subSize} onChange={(e) => setSubSize(Number(e.target.value) || 15)} />
                </label>

                <div className="zine-creator__panel-group">Layout</div>
                <div className="zine-field">
                  <label>Image</label>
                  <ModePicker
                    value={selectedCover.imageMode}
                    onChange={(m) => updateCover(selectedId as 'front' | 'back', { imageMode: m })}
                    options={['none', 'portrait', 'landscape1', 'landscape2']}
                  />
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

                <div className="zine-creator__panel-group">Paper &amp; border</div>
                <div className="zine-field">
                  <label>Cover color</label>
                  <input type="color" value={selectedCover.bgColor} onChange={(e) => updateCover(selectedId as 'front' | 'back', { bgColor: e.target.value })} className="zine-color-input" />
                </div>
                <div className="zine-field">
                  <label>Border color</label>
                  <input type="color" value={selectedCover.borderColor} onChange={(e) => updateCover(selectedId as 'front' | 'back', { borderColor: e.target.value })} className="zine-color-input" />
                </div>
                <div className="zine-field" style={{ width: 180 }}>
                  <label>Border {selectedCover.borderPct}%</label>
                  <input type="range" min={0} max={30} step={1} value={selectedCover.borderPct} onChange={(e) => updateCover(selectedId as 'front' | 'back', { borderPct: Number(e.target.value) })} className="zine-range" />
                </div>
                {selectedId === 'back' && socialHandles.length > 0 && (
                  <div className="zine-field">
                    <label>&nbsp;</label>
                    <label className="zine-checkbox">
                      <input type="checkbox" checked={showSocialHandles} onChange={(e) => setShowSocialHandles(e.target.checked)} />
                      Show social handles
                    </label>
                  </div>
                )}
                {selectedId === 'back' && socialHandles.length === 0 && (
                  <p className="muted" style={{ margin: 0, alignSelf: 'flex-end' }}>Add social handles in Settings to show them here.</p>
                )}
              </>
            )}

            {selectedSpread && (
              <>
                <div className="zine-creator__panel-group">Layout</div>
                <div className="zine-field">
                  <label>Spread</label>
                  <div className="segmented">
                    <span className={`segmented__opt ${selectedSpread.spanMode === 'split' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { spanMode: 'split' })}>Two pages</span>
                    <span className={`segmented__opt ${selectedSpread.spanMode === 'span' ? 'active' : ''}`} onClick={() => updateSpread(selectedId, { spanMode: 'span' })}>Spans spread</span>
                  </div>
                </div>

                {selectedSpread.spanMode === 'split' && (
                  <>
                    <div className="zine-field">
                      <label>Left page</label>
                      <ModePicker value={selectedSpread.modeL} onChange={(m) => updateSpread(selectedId, { modeL: m })} options={['portrait', 'landscape1', 'landscape2']} />
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
                      <ModePicker value={selectedSpread.modeR} onChange={(m) => updateSpread(selectedId, { modeR: m })} options={['portrait', 'landscape1', 'landscape2']} />
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
                      <ModePicker value={selectedSpread.modeSpan} onChange={(m) => updateSpread(selectedId, { modeSpan: m })} options={['landscape1', 'landscape2']} />
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

      {mobileSetupOpen && (
        <div className="modal-overlay" onClick={() => setMobileSetupOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__title">Zine settings</div>
            <div className="zine-creator__setup-modal-controls">{renderSetupControls()}</div>
            <div className="modal-actions">
              <button className="btn btn-solid" onClick={() => setMobileSetupOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {templatesOpen && (
        <div className="modal-overlay" onClick={() => setTemplatesOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__title">Templates</div>
            <p className="muted" style={{ margin: 0 }}>
              A template captures layout and style — page count, paper size, fonts, cover and spread settings — but not
              which photos are placed. Applying one replaces your current layout (Ctrl+Z to undo).
            </p>
            {templates.length > 0 && (
              <div className="zine-template-list">
                {templates.map((t) => (
                  <div key={t.id} className="zine-template-row">
                    <span className="zine-template-row__name">{t.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{t.pageCount}pp · {t.paperSize}</span>
                    <button type="button" className="btn" onClick={() => applyTemplate(t)}>Apply</button>
                    <button type="button" className="btn btn-danger" onClick={() => deleteTemplate(t.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
            {templates.length === 0 && <p className="muted" style={{ margin: 0 }}>No saved templates yet.</p>}
            <div className="zine-template-save-row">
              <input
                value={templateNameInput}
                onChange={(e) => setTemplateNameInput(e.target.value)}
                placeholder="Template name"
                onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
              />
              <button type="button" className="btn btn-solid" onClick={saveAsTemplate}>Save current as template</button>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setTemplatesOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

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

function ZineImageSlot({
  photoId, fit, fillColor, transform, onPick, onClear, onTransformChange,
}: {
  photoId: number | undefined; fit: ImageFit; fillColor: string; transform: SlotTransform;
  onPick: () => void; onClear: () => void; onTransformChange: (patch: Partial<SlotTransform>) => void;
}) {
  const drag = useRef<{ startX: number; startY: number; startOx: number; startOy: number; moved: boolean } | null>(null);
  // The click event that ends a drag fires *after* pointerup, so the
  // moved-flag can't live only on `drag.current` — that gets cleared in
  // handlePointerUp before handleSlotClick ever runs. This ref survives
  // past that point and is consumed (cleared) by the click handler itself.
  const suppressNextClick = useRef(false);
  const [captionOpen, setCaptionOpen] = useState(!!transform.caption.trim());
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (photoId == null) {
    return (
      <button className="zine-slot zine-slot--empty" onClick={onPick} type="button">
        <span className="zine-slot__plus">+</span>
        <span className="zine-slot__label">Add photo</span>
      </button>
    );
  }

  const pannable = fit === 'cover';

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!pannable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    suppressNextClick.current = false;
    drag.current = { startX: e.clientX, startY: e.clientY, startOx: transform.ox, startOy: transform.oy, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { drag.current.moved = true; suppressNextClick.current = true; }
    const rect = e.currentTarget.getBoundingClientRect();
    // Drag right -> reveal more of the image's left side (the photo
    // appears to move with the cursor), so ox moves opposite to dx.
    const nextOx = clamp(drag.current.startOx + dx / rect.width / transform.zoom, -0.4, 0.4);
    const nextOy = clamp(drag.current.startOy + dy / rect.height / transform.zoom, -0.4, 0.4);
    onTransformChange({ ox: nextOx, oy: nextOy });
  }

  function handlePointerUp() {
    drag.current = null;
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!pannable) return;
    e.preventDefault();
    onTransformChange({ zoom: clamp(transform.zoom - e.deltaY * 0.001, 1, 3) });
  }

  // The click handler lives on this same div (not the <img>) because it's
  // also the pointer-capture target: once setPointerCapture is called here,
  // the browser can retarget the matching click event to this element
  // rather than the img, and a click handler on the img would then never
  // fire at all. Attaching it here means retargeting doesn't matter.
  function handleSlotClick(e: React.MouseEvent) {
    if (suppressNextClick.current) { suppressNextClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
    onPick();
  }

  const isAdjusted = transform.ox !== 0 || transform.oy !== 0 || transform.zoom !== 1;
  const isFiltered = transform.brightness !== 100 || transform.contrast !== 100 || transform.saturate !== 100;
  const rotated90 = transform.rotation === 90 || transform.rotation === 270;
  const filterCss = isFiltered ? `brightness(${transform.brightness}%) contrast(${transform.contrast}%) saturate(${transform.saturate}%)` : undefined;
  const rotateTransform = transform.rotation !== 0 ? `rotate(${transform.rotation}deg)` : '';
  const zoomTransform = pannable && transform.zoom !== 1 ? `scale(${transform.zoom})` : '';

  function toggleCaption() {
    if (captionOpen) {
      setCaptionOpen(false);
      if (transform.caption) onTransformChange({ caption: '' });
    } else {
      setCaptionOpen(true);
    }
  }

  const captionBand = captionOpen && (
    <div className="zine-slot__caption" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <input
        value={transform.caption}
        onChange={(e) => onTransformChange({ caption: e.target.value })}
        placeholder="Caption…"
        autoFocus
      />
      <button
        type="button"
        className="zine-slot__caption-flip"
        onClick={() => onTransformChange({ captionPosition: transform.captionPosition === 'above' ? 'below' : 'above' })}
        title={transform.captionPosition === 'above' ? 'Move caption below the photo' : 'Move caption above the photo'}
      >
        {transform.captionPosition === 'above' ? '↓' : '↑'}
      </button>
    </div>
  );

  return (
    <div className="zine-slot zine-slot--filled" style={{ background: fillColor }}>
      {transform.captionPosition === 'above' && captionBand}
      <div
        className="zine-slot__image-area"
        style={{ cursor: pannable ? 'grab' : 'default' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleSlotClick}
      >
        <img
          src={`/files/display/${photoId}`}
          alt=""
          draggable={false}
          style={{
            objectFit: fit,
            objectPosition: pannable ? `${50 - transform.ox * 100}% ${50 - transform.oy * 100}%` : '50% 50%',
            filter: filterCss,
            // A 90/270 rotation needs the image's own box swapped to the
            // container's cross-axis size before rotating, or it doesn't
            // fill the (non-square) container correctly — cqw/cqh read the
            // container's own width/height regardless of which axis the
            // rotated element ends up occupying, so this works without any
            // JS measurement (see .zine-slot__image-area's container-type).
            ...(rotated90
              ? { position: 'absolute', top: '50%', left: '50%', width: '100cqh', height: '100cqw', transform: `translate(-50%, -50%) ${rotateTransform} ${zoomTransform}`.trim() }
              : { transform: `${rotateTransform} ${zoomTransform}`.trim() || undefined }),
          }}
        />
        <button type="button" className="zine-slot__delete" onClick={(e) => { e.stopPropagation(); onClear(); }} title="Remove image">×</button>
        <div className="zine-slot__controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onTransformChange({ rotation: (((transform.rotation + 90) % 360) as 0 | 90 | 180 | 270) })} title="Rotate 90°">
            ⟳
          </button>
          <button type="button" className={captionOpen ? 'is-active' : ''} onClick={toggleCaption} title="Add caption">
            Aa
          </button>
          <button type="button" className={filtersOpen ? 'is-active' : ''} onClick={() => setFiltersOpen((v) => !v)} title="Brightness / contrast / saturation">
            ◐
          </button>
        </div>
        {pannable && (
          <div className="zine-slot__zoom" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => onTransformChange({ zoom: clamp(transform.zoom - 0.2, 1, 3) })} title="Zoom out">−</button>
            <button type="button" onClick={() => onTransformChange({ zoom: clamp(transform.zoom + 0.2, 1, 3) })} title="Zoom in">+</button>
            {isAdjusted && (
              <button type="button" onClick={() => onTransformChange({ ox: 0, oy: 0, zoom: 1 })} title="Reset position">⟲</button>
            )}
          </div>
        )}
        {filtersOpen && (
          <div className="zine-slot__filters" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <label>
              <span>Bright</span>
              <input type="range" min={50} max={150} value={transform.brightness} onChange={(e) => onTransformChange({ brightness: Number(e.target.value) })} />
            </label>
            <label>
              <span>Contrast</span>
              <input type="range" min={50} max={150} value={transform.contrast} onChange={(e) => onTransformChange({ contrast: Number(e.target.value) })} />
            </label>
            <label>
              <span>Color</span>
              <input type="range" min={0} max={200} value={transform.saturate} onChange={(e) => onTransformChange({ saturate: Number(e.target.value) })} />
            </label>
            {isFiltered && (
              <button type="button" onClick={() => onTransformChange({ brightness: 100, contrast: 100, saturate: 100 })} title="Reset adjustments">
                Reset
              </button>
            )}
          </div>
        )}
      </div>
      {transform.captionPosition === 'below' && captionBand}
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

// Rotates the canvas around the destination rect's own center, then draws
// into an "effective" rect that's width/height-swapped for a 90/270
// rotation — after the rotation transform, that swapped rect exactly fills
// the original (unrotated) dx/dy/dw/dh, mirroring the live preview's cqw/
// cqh trick (see ZineImageSlot) without needing any DOM measurement here.
function withRotation(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, rotation: number, filterCss: string | undefined, draw: (dx: number, dy: number, dw: number, dh: number) => void) {
  ctx.save();
  ctx.filter = filterCss || 'none';
  const cx = dx + dw / 2, cy = dy + dh / 2;
  if (rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  const swapped = rotation === 90 || rotation === 270;
  const effDw = swapped ? dh : dw, effDh = swapped ? dw : dh;
  draw(cx - effDw / 2, cy - effDh / 2, effDw, effDh);
  ctx.restore();
}

// ox/oy/zoom mirror the live preview's object-position + transform:scale
// pan/zoom (see ZineImageSlot) — same sign convention, so what you drag
// into place while editing is exactly what prints.
function drawCoverFit(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number,
  ox = 0, oy = 0, zoom = 1, rotation = 0, filterCss?: string
) {
  if (dw <= 0 || dh <= 0) return;
  withRotation(ctx, dx, dy, dw, dh, rotation, filterCss, (edx, edy, edw, edh) => {
    const scale = Math.max(edw / img.width, edh / img.height) * zoom;
    const sw = edw / scale, sh = edh / scale;
    const cx = img.width / 2 - ox * img.width;
    const cy = img.height / 2 - oy * img.height;
    const sx = clamp(cx - sw / 2, 0, Math.max(0, img.width - sw));
    const sy = clamp(cy - sh / 2, 0, Math.max(0, img.height - sh));
    ctx.drawImage(img, sx, sy, sw, sh, edx, edy, edw, edh);
  });
}

// "Fit" mode — the whole photo stays uncropped, scaled to fit inside the
// slot and centered; whatever margin that leaves is the slot's own border
// color (already painted behind it), matching the live preview's letterbox.
function drawContainFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number, rotation = 0, filterCss?: string) {
  if (dw <= 0 || dh <= 0) return;
  withRotation(ctx, dx, dy, dw, dh, rotation, filterCss, (edx, edy, edw, edh) => {
    const scale = Math.min(edw / img.width, edh / img.height);
    const sw = img.width * scale, sh = img.height * scale;
    const ox = edx + (edw - sw) / 2, oy = edy + (edh - sh) / 2;
    ctx.drawImage(img, ox, oy, sw, sh);
  });
}

// Plain white band with centered dark text, same look regardless of paper
// size or which cell it's attached to — a simple, predictable caption
// style rather than trying to match every possible cover/border color.
function drawCaptionBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string) {
  if (w <= 0 || h <= 0 || !text) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  const fontSize = Math.max(10, h * 0.42);
  ctx.font = `500 ${fontSize}px Inter, sans-serif`;
  ctx.fillStyle = '#161826';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2, w * 0.94);
  ctx.restore();
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
  slotTransforms: Record<string, SlotTransform>;
  borderColor: string;
  borderPct: number;
  overlay?: { header: string; sub1: string; sub2: string; vAlign: VAlign; hAlign: HAlign; font: string; headerSize: number; subSize: number };
  socialHandles?: string[];
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
      const photoId = spec.slotPhotos[spec.images[i]];
      // Only paint the border-color fill when there's actually a photo to
      // frame — otherwise an empty slot on a cover overwrote the cover's
      // own bgColor with the (often white) border color, and the text
      // overlay's contrast scrim on top of that read as a washed-out gray
      // gradient instead of showing the intended solid cover color.
      if (photoId != null) {
        ctx.fillStyle = spec.borderColor;
        ctx.fillRect(0, cellY, spec.widthPx, cellH);
        const img = await loadImage(`/files/display/${photoId}`);
        if (img) {
          // Merge over defaults rather than falling back to them wholesale
          // — see getTransform's comment; a save from before these fields
          // existed has a real (partial) stored object, not nothing.
          const t = { ...DEFAULT_TRANSFORM, ...spec.slotTransforms[spec.images[i]] };
          const filterCss = t.brightness !== 100 || t.contrast !== 100 || t.saturate !== 100
            ? `brightness(${t.brightness}%) contrast(${t.contrast}%) saturate(${t.saturate}%)`
            : undefined;

          const hasCaption = t.caption.trim().length > 0;
          // 15% matches .zine-slot__caption's flex-basis in the live preview.
          const capH = hasCaption ? cellH * 0.15 : 0;
          const imgDy = cellY + padPx + (hasCaption && t.captionPosition === 'above' ? capH : 0);
          const imgDh = cellH - 2 * padPx - capH;

          if (spec.imageFit === 'contain') {
            drawContainFit(ctx, img, padPx, imgDy, spec.widthPx - 2 * padPx, imgDh, t.rotation, filterCss);
          } else {
            drawCoverFit(ctx, img, padPx, imgDy, spec.widthPx - 2 * padPx, imgDh, t.ox, t.oy, t.zoom, t.rotation, filterCss);
          }

          if (hasCaption) {
            const capY = t.captionPosition === 'above' ? cellY + padPx : cellY + cellH - padPx - capH;
            drawCaptionBand(ctx, padPx, capY, spec.widthPx - 2 * padPx, capH, t.caption);
          }
        }
      }
    }
  }

  const reserveBottomPx = spec.socialHandles && spec.socialHandles.length > 0 && spec.overlay?.hAlign === 'left' ? spec.heightPx * SOCIAL_BADGE_RESERVE_FRAC : 0;
  if (spec.overlay) drawCoverOverlay(ctx, spec.widthPx, spec.heightPx, spec.overlay, reserveBottomPx);
  if (spec.socialHandles && spec.socialHandles.length > 0) drawSocialHandles(ctx, spec.widthPx, spec.heightPx, spec.socialHandles);

  return canvas;
}

function drawCoverOverlay(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, overlay: NonNullable<RenderSpec['overlay']>, reserveBottomPx = 0) {
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
  else if (vAlign === 'bottom') y = heightPx - padding - reserveBottomPx - totalHeight + (lines[0]?.size ?? 0) * 0.9;
  else y = heightPx / 2 - totalHeight / 2 + (lines[0]?.size ?? 0) * 0.9;

  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px "${font}", sans-serif`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x, y);
    y += line.size * 1.2 + lineGap;
  }

  ctx.restore();
}

// Bottom-left credit line on the back cover — always the same corner and
// style regardless of the cover's own text alignment settings, since it's
// a separate, optional "who made this" tag, not part of the header/subtext.
function drawSocialHandles(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, handles: string[]) {
  ctx.save();
  const text = handles.join('  ·  ');
  const fontSize = widthPx * 0.024;
  ctx.font = `500 ${fontSize}px Inter, sans-serif`;

  const paddingX = widthPx * 0.02;
  const paddingY = heightPx * 0.015;
  const boxPadding = fontSize * 0.55;
  const textWidth = ctx.measureText(text).width;
  const boxW = Math.min(textWidth + boxPadding * 2, widthPx - paddingX * 2);
  const boxH = fontSize * 1.9;
  const boxX = paddingX;
  const boxY = heightPx - paddingY - boxH;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxX + boxPadding, boxY + boxH / 2);

  ctx.restore();
}
