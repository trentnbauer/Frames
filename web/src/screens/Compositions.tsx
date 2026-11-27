import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KINDS, STAGES, listOrder, useCompositionsQuery, zineKindOf, type ListKind } from './compositionsList';
import { api, imgUrl, useApi, downloadOriginals } from '../api';
import type { Collection, PhotoLite } from '../data';
import { ppiOf, sizeName } from '../layout';
import { useUi } from '../ui';
import { chosenCount, printsSummary, slotsOf } from './walls';
import ProtoCompositions from '../proto/ProtoCompositions';
import { CompositionPreview } from '../components/CompositionPreview';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileCompositions } from '../mobile/Compositions';
import { ZineList, type Zine } from './Zines';
import { SegSlider } from '../components/SegSlider';
import { Kbd, useShortcuts } from '../components/shortcuts';
import { useToast } from '../desktop/parts';
import { useScrollRestore } from '../useScrollRestore';

type SuggestedSet = { aiAssisted?: boolean; name: string; reason: string; photoIds: number[]; photos: { id: number }[] };

const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 14 ? 'last week' : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};


/** Compositions: frames, zines, carousels and notebooks, each by stage (Progress, Review, Done), from the design. */
export function Compositions() {
  return usePhoneWidth() ? <MobileCompositions /> : <DesktopCompositions />;
}

function DesktopCompositions() {
  const nav = useNavigate();
  const { kind, stage, created, asc, q, set } = useCompositionsQuery();
  const zines = useApi<Zine[]>('/zines');
  const toast = useToast();
  const { openNew } = useUi();
  const colls = useApi<Collection[]>('/collections');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const sug = useApi<SuggestedSet[]>('/collections/suggestions');
  useScrollRestore(!!colls.data && !!zines.data && !!lib.data && !!sug.data); // the suggestion card sits above the list
  const [si, setSi] = useState(0);
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const all = colls.data ?? [];
  const needle = q.trim().toLowerCase();
  const match = (c: Collection) => !needle || c.name.toLowerCase().includes(needle);
  const order = listOrder(created, asc);

  const card = (c: Collection) => {
    const slots = slotsOf(c), chosen = chosenCount(c);
    return { id: c.id, name: c.name, prints: printsSummary(c), status: chosen === 0 ? 'Not started' : `${chosen} of ${slots} chosen`, pct: `${slots ? Math.round((chosen / slots) * 100) : 0}%`, preview: <CompositionPreview collection={c} photos={byId} /> };
  };
  const prog = all.filter((c) => c.stage === 'progress' && match(c)).sort(order).map(card);
  const ready = all.filter((c) => c.stage === 'done' && match(c)).sort(order).map((c) => {
    const ps = c.layout.prints;
    const photos = ps.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null).map((id) => byId.get(id)).filter((p): p is PhotoLite => !!p);
    const sizes = new Map<string, number>(); ps.forEach((p) => { const k = `${sizeName(p.size)} · ${p.orientation}`; sizes.set(k, (sizes.get(k) ?? 0) + 1); });
    const frames = new Map<string, number>(); ps.forEach((p) => { if (p.frame) { const k = `${p.frame.color} ${sizeName(p.frame.size)}${p.frame.size !== p.size ? `, ${p.frame.mat} mat` : ', no mat'}`; frames.set(k, (frames.get(k) ?? 0) + 1); } });
    const low = ps.filter((p) => { const ph = p.photoId ? byId.get(p.photoId) : undefined; const v = ppiOf(ph, p); return v != null && v < (c.layout.ppi ?? 300); }).length;
    const mb = photos.reduce((n, p) => n + (p.sizeMb || 0), 0);
    return {
      id: c.id, name: c.name, when: c.printedAt ? `Printed ${ago(c.printedAt)}` : c.updatedAt ? `Done ${ago(c.updatedAt)}` : 'Done', preview: <CompositionPreview collection={c} photos={byId} />,
      rows: [
        { k: 'Prints', v: [...sizes].map(([k, n]) => `${n} × ${k}`).join(', '), ok: '' },
        { k: 'Frames', v: frames.size ? [...frames].map(([k, n]) => `${n} × ${k}`).join(', ') : 'None, posters', ok: '' },
        { k: photos.length === 1 ? 'Photo' : 'Photos', v: photos.map((p) => p.title || p.file).slice(0, 4).join(', ') + (photos.length > 4 ? '…' : ''), ok: low ? `⚠ ${low} below ${c.layout.ppi ?? 300} PPI` : `✓ ${c.layout.ppi ?? 300} PPI` },
        { k: 'Export', v: `${photos.length} original${photos.length === 1 ? '' : 's'} · ${Math.round(mb)} MB`, ok: '' },
      ],
    };
  });
  const review = all.filter((c) => c.stage === 'review' && match(c)).sort(order).map(card);
  const s0 = (sug.data ?? [])[si % Math.max(1, sug.data?.length ?? 1)];

  const zineList = zines.data ?? [];
  // New composition starts a frame wall; on the Zines or Carousels view it starts one of those, as their own lists used to.
  const zineKind = zineKindOf(kind);
  const make = () => { if (kind === 'frames') { openNew(); return; } api<Zine>('/zines', { body: { kind: zineKind } }).then((z) => nav(`/zines/${z.id}`), (e: Error) => toast.say(e.message)); };
  const makeLabel = kind === 'frames' ? 'New composition' : `New ${zineKind}`;
  const ofKind = (k: ListKind) => k === 'frames' ? all.length : zineList.filter((z) => (z.kind ?? 'zine') === zineKindOf(k)).length;
  const shown = kind === 'frames' ? all : zineList.filter((z) => (z.kind ?? 'zine') === zineKind);
  const inStage = (st: string) => shown.filter((c) => (c.stage ?? 'progress') === st && (!needle || c.name.toLowerCase().includes(needle))).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  useShortcuts([{ key: 'n', label: makeLabel, run: make }]);
  const header = <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}><h1 style={{ font: "400 48px/1 'Instrument Serif',Georgia,serif", margin: 0 }}>Compositions</h1><span style={{ fontSize: 13, color: 'var(--muted)' }}>{[plural(ofKind('frames'), 'frame', 'frames'), plural(ofKind('zines'), 'zine', 'zines'), plural(ofKind('carousels'), 'carousel', 'carousels'), plural(ofKind('notebooks'), 'notebook', 'notebooks')].join(' · ')}</span></div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flex: 'none' }}><button onClick={make} style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 24px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15 }}>{makeLabel}</button><Kbd k="N" /></span>
    </div>
    <div className="comp-bar">
      <div className="bar-seg" role="tablist" aria-label="Kind"><SegSlider />
        {KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => set('kind', k === 'frames' ? null : k)}>{l}<span className="n">{ofKind(k)}</span></button>)}
      </div>
      <input value={q} onChange={(e) => set('find', e.target.value)} placeholder="Find a composition" aria-label="Find a composition" className="comp-find" />
      <div className="bar-seg" role="radiogroup" aria-label="Stage"><SegSlider />
        {STAGES.map(([k, l]) => <button key={k} role="radio" aria-checked={stage === k} onClick={() => set('stage', k === 'progress' ? null : k)}><span aria-hidden="true" className={`stage-shape ${k}`} />{l}<span className="n">{inStage(k)}</span></button>)}
      </div>
      <div className="bar-seg" role="radiogroup" aria-label="Sort by"><SegSlider />
        {([['created', 'Created'], ['updated', 'Updated']] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={(k === 'created') === created} onClick={() => set('sort', k === 'created' ? k : null)}>{l}</button>)}
      </div>
      <button className="sort-dir" onClick={() => set('dir', asc ? null : 'asc')} aria-label={asc ? 'Oldest first: show newest first' : 'Newest first: show oldest first'} title={asc ? 'Oldest first' : 'Newest first'}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: asc ? 'rotate(180deg)' : 'none', transition: 'transform .25s ease' }}><path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" /></svg>
      </button>
    </div>
  </>;

  return (
    <div className="page-shell">
      {/* One header for every kind, so switching kind slides the pill instead of rebuilding the bar. */}
      <div className="compositions-list-header">{header}</div>
      {toast.node}
      {kind === 'frames' ? <ProtoCompositions tab={stage}
        prog={prog} review={review} ready={ready}
        onOpen={(id: number) => nav(`/collections/${id}`)}
        onExport={async (id: number) => { const c = all.find((x) => x.id === id)!; const ids = c.layout.prints.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null); await downloadOriginals(ids); }}
        onSheet={(id: number) => { window.location.assign(`/api/collections/${id}/print-sheet`); }}
        sugg={s0 && !needle ? {
          aiAssisted: !!s0.aiAssisted, name: s0.name, why: s0.reason, thumbs: s0.photos.slice(0, 3).map((p) => imgUrl(p.id, 'thumb')), pos: `${(si % (sug.data?.length ?? 1)) + 1} of ${sug.data?.length ?? 1}`,
          next: () => setSi(si + 1),
          start: async () => { await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s0.photoIds, verdict: 'accept' } }); openNew({ name: s0.name, photoIds: s0.photoIds }); },
        } : null}
      /> : <ZineList kind={zineKind} stage={stage} find={q} order={order} />}
    </div>
  );
}
