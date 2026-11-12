import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { Header } from '../components/Shell';
import { ppiOf, sizeName } from '../layout';
import { useUi } from '../ui';
import { chosenCount, isReady, printsSummary, slotsOf } from './walls';
import ProtoCompositions from '../proto/ProtoCompositions';
import { CompositionPreview } from '../components/CompositionPreview';

type SuggestedSet = { name: string; reason: string; photoIds: number[]; photos: { id: number }[] };

const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 14 ? 'last week' : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Hands each original to the browser's own downloader, in print order. The files are never altered. */
async function downloadOriginals(ids: number[]) {
  const pad = String(ids.length).length;
  for (let i = 0; i < ids.length; i++) {
    const a = document.createElement('a');
    a.href = `/api/photos/${ids[i]}/original?n=${i + 1}&pad=${pad}`; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
    await new Promise((r) => setTimeout(r, 450)); // browsers drop downloads fired in the same instant
  }
}

/** Compositions: In progress, Ready to export and Printed, from the design. */
export function Compositions() {
  const nav = useNavigate();
  const { openNew } = useUi();
  const colls = useApi<Collection[]>('/collections');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const sug = useApi<SuggestedSet[]>('/collections/suggestions');
  const [q, setQ] = useState('');
  const [byName, setByName] = useState(false);
  const [si, setSi] = useState(0);
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const all = colls.data ?? [];
  const needle = q.trim().toLowerCase();
  const match = (c: Collection) => !needle || c.name.toLowerCase().includes(needle);
  const order = (a: Collection, b: Collection) => (byName ? a.name.localeCompare(b.name) : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id);

  const card = (c: Collection) => {
    const slots = slotsOf(c), chosen = chosenCount(c);
    return { id: c.id, name: c.name, prints: printsSummary(c), status: chosen === 0 ? 'Not started' : `${chosen} of ${slots} chosen`, pct: `${slots ? Math.round((chosen / slots) * 100) : 0}%`, preview: <CompositionPreview collection={c} photos={byId} /> };
  };
  const prog = all.filter((c) => !c.printedAt && !isReady(c) && match(c)).sort(order).map(card);
  const ready = all.filter((c) => isReady(c) && match(c)).sort(order).map((c) => {
    const ps = c.layout.prints;
    const photos = ps.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null).map((id) => byId.get(id)).filter((p): p is PhotoLite => !!p);
    const sizes = new Map<string, number>(); ps.forEach((p) => { const k = `${sizeName(p.size)} · ${p.orientation}`; sizes.set(k, (sizes.get(k) ?? 0) + 1); });
    const frames = new Map<string, number>(); ps.forEach((p) => { if (p.frame) { const k = `${p.frame.color} ${sizeName(p.frame.size)}${p.frame.size !== p.size ? `, ${p.frame.mat} mat` : ', no mat'}`; frames.set(k, (frames.get(k) ?? 0) + 1); } });
    const low = ps.filter((p) => { const ph = p.photoId ? byId.get(p.photoId) : undefined; const v = ppiOf(ph, p); return v != null && v < (c.layout.ppi ?? 300); }).length;
    const mb = photos.reduce((n, p) => n + (p.sizeMb || 0), 0);
    return {
      id: c.id, name: c.name, when: `Finished ${ago(c.updatedAt)}`, preview: <CompositionPreview collection={c} photos={byId} />,
      rows: [
        { k: 'Prints', v: [...sizes].map(([k, n]) => `${n} × ${k}`).join(', '), ok: '' },
        { k: 'Frames', v: frames.size ? [...frames].map(([k, n]) => `${n} × ${k}`).join(', ') : 'None, posters', ok: '' },
        { k: photos.length === 1 ? 'Photo' : 'Photos', v: photos.map((p) => p.title || p.file).slice(0, 4).join(', ') + (photos.length > 4 ? '…' : ''), ok: low ? `⚠ ${low} below ${c.layout.ppi ?? 300} PPI` : `✓ ${c.layout.ppi ?? 300} PPI` },
        { k: 'Export', v: `${photos.length} original${photos.length === 1 ? '' : 's'} · ${Math.round(mb)} MB`, ok: '' },
      ],
    };
  });
  const printedAll = all.filter((c) => !!c.printedAt).sort((a, b) => (b.printedAt ?? '').localeCompare(a.printedAt ?? ''));
  const printedList = printedAll.filter(match).map((c) => ({ id: c.id, name: c.name, prints: printsSummary(c), where: 'Not hung yet', date: new Date(c.printedAt!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), lab: '—', cost: '—', preview: <CompositionPreview collection={c} photos={byId} /> }));
  const nPrints = printedAll.reduce((n, c) => n + c.layout.prints.length, 0), nFrames = printedAll.reduce((n, c) => n + c.layout.prints.filter((p) => p.frame).length, 0);
  const s0 = (sug.data ?? [])[si % Math.max(1, sug.data?.length ?? 1)];

  return (
    <div className="page-shell">
      <Header />
      <ProtoCompositions
        prog={prog} ready={ready} printedList={printedList}
        pStats={[[String(printedAll.length), 'compositions printed'], [String(nPrints), 'prints'], [String(nFrames), 'frames'], ['—', 'labs used']].map(([v, l]) => ({ v, l }))}
        printedMore={`Showing ${printedList.length} of ${printedAll.length}`}
        sortLabel={(tab: string) => (tab === 'printed' ? 'Newest printed' : byName ? 'Name' : 'Last edited')} onToggleSort={() => setByName(!byName)}
        q={q} onQ={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
        onOpen={(id: number) => nav(`/collections/${id}`)} onNew={() => openNew()}
        onExport={async (id: number) => { const c = all.find((x) => x.id === id)!; const ids = c.layout.prints.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null); await downloadOriginals(ids); }}
        onSheet={(id: number) => { window.location.assign(`/api/collections/${id}/print-sheet`); }}
        onPrinted={async (id: number) => { await api(`/collections/${id}`, { method: 'PATCH', body: { printed: true } }); colls.reload(); }}
        sugg={s0 && !needle ? {
          name: s0.name, why: s0.reason, thumbs: s0.photos.slice(0, 3).map((p) => imgUrl(p.id, 'thumb')), pos: `${(si % (sug.data?.length ?? 1)) + 1} of ${sug.data?.length ?? 1}`,
          next: () => setSi(si + 1),
          start: async () => { const c = await api<Collection>('/collections', { body: { name: s0.name, photoIds: s0.photoIds } }); await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s0.photoIds, verdict: 'accept' } }); nav(`/collections/${c.id}`); },
        } : null}
      />
    </div>
  );
}
