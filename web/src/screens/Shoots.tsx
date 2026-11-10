import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { Header } from '../components/Shell';
import { useStatus } from '../components/AddPhotos';
import { useStore } from '../store';
import { useUi } from '../ui';
import ProtoShoots from '../proto/ProtoShoots';

type Conn = { id: string; provider: string; account: string; folderId: unknown; enabled: boolean; needsReconnect?: boolean };
type ScanResult = { shootId?: number | null; imported: number; duplicates: number; shootName: string | null };
type Suggestion = { groups: { name: string; photoIds: number[] }[]; shootId?: number; name?: string };

const dayLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No camera date');
const todayName = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const PROVIDER: Record<string, [string, string]> = { google: ['GD', 'Google Drive'], gdrive: ['GD', 'Google Drive'], icloud: ['iC', 'iCloud Photos'], dropbox: ['Db', 'Dropbox'], onedrive: ['OD', 'OneDrive'] };

async function waitScan(): Promise<ScanResult | null> {
  await api('/library/scan', { method: 'POST', body: {} });
  for (;;) {
    const s = await api<{ running: boolean; result: ScanResult | null; error: string | null }>('/library/scan/status');
    if (!s.running) { if (s.error) throw new Error(s.error); return s.result; }
    await new Promise((r) => setTimeout(r, 600));
  }
}
/** Sends the files with real progress, one request (the server takes them all as `file`). */
function send(files: File[], onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const fd = new FormData(); for (const f of files) fd.append('file', f);
    const x = new XMLHttpRequest(); x.open('POST', '/api/upload');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error((() => { try { return JSON.parse(x.responseText).error; } catch { return ''; } })() || 'Upload failed')));
    x.onerror = () => reject(new Error('Upload failed'));
    x.send(fd);
  });
}

/** Photoshoots (the list) and a shoot (the view), from the design. One screen: /shoots and /shoots/:id. */
export function Shoots() {
  const { id } = useParams();
  const sid = id ? Number(id) : null;
  const nav = useNavigate();
  const { settings } = useStore();
  const { openNew } = useUi();
  const status = useStatus();
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<{ count: number }>('/library/pending');
  const sugg = useApi<Suggestion[]>('/shoots/suggestions');
  const colls = useApi<Collection[]>('/collections');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const cloud = useApi<{ connections: Conn[] }>(status.data?.storage.cloud || status.data?.cloudProviders.length ? '/cloud' : null);
  const shootPhotos = useApi<{ photos: PhotoLite[] }>(sid ? `/photos?shoot=${sid}&order=oldest` : null);
  const [q, setQ] = useState('');
  const [newest, setNewest] = useState(true);
  const [filter, setFilter] = useState<'' | 'uncomposed' | 'review'>('');
  const [importing, setImporting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [req, setReq] = useState(0);
  const [sp, setSp] = useSearchParams();
  useEffect(() => { if (sp.get('upload')) { setReq(Date.now()); setSp({}, { replace: true }); } }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useRef<HTMLInputElement>(null);

  const local = !!status.data?.storage.local;
  const conns = (cloud.data?.connections ?? []).filter((c) => c.folderId !== null && c.enabled && !c.needsReconnect);
  const cloudOn = conns.length > 0;
  const shootOf = new Map((lib.data?.photos ?? []).map((p) => [p.id, p.shootId]));
  const compsPerShoot = new Map<number, Set<number>>();
  for (const c of colls.data ?? []) for (const pid of c.photoIds) { const s = shootOf.get(pid); if (s != null) (compsPerShoot.get(s) ?? compsPerShoot.set(s, new Set()).get(s)!).add(c.id); }
  const tagFor = (s: Shoot) => { const n = compsPerShoot.get(s.id)?.size ?? 0; return s.reviewPct < 100 ? { tag: 'Needs review', tagColor: 'var(--text)' } : n ? { tag: `In ${n} composition${n === 1 ? '' : 's'}`, tagColor: 'var(--text2)' } : { tag: 'Not composed', tagColor: 'var(--text)' }; };
  const all = [...(shoots.data ?? [])].sort((a, b) => (a.dateFrom ?? a.importedAt).localeCompare(b.dateFrom ?? b.importedAt) * (newest ? -1 : 1));
  const needle = q.trim().toLowerCase();
  const shown = all.filter((s) => (!needle || [s.name, s.place, s.dates].join(' ').toLowerCase().includes(needle)) && (filter === '' || (filter === 'uncomposed' ? !(compsPerShoot.get(s.id)?.size) : s.reviewPct < 100)));
  const nUncomposed = all.filter((s) => !(compsPerShoot.get(s.id)?.size)).length, nReview = all.filter((s) => s.reviewPct < 100).length;
  const years = [...new Set(all.map((s) => (s.dateFrom ?? s.importedAt ?? '').slice(0, 4)).filter(Boolean))];
  const totalPhotos = all.reduce((n, s) => n + s.count, 0);
  const s0 = sugg.data?.[0];

  const reloadAll = () => { shoots.reload(); pending.reload(); sugg.reload(); lib.reload(); shootPhotos.reload(); };

  // The open shoot.
  const sh = sid ? all.find((s) => s.id === sid) : undefined;
  const ph = shootPhotos.data?.photos ?? [];
  const inComp = new Set((colls.data ?? []).flatMap((c) => c.photoIds));
  const view = sh ? {
    id: sh.id, name: sh.name, place: sh.place || 'No place', dates: sh.dates,
    kit: [sh.gear?.camera, sh.gear?.lens, sh.gear?.film].filter(Boolean).join(' · ') || [...new Set(ph.map((p) => p.camera).filter(Boolean))].slice(0, 2).join(' · '),
  } : null;
  const viewPhotos = ph.map((p) => ({ id: p.id, ar: p.ar, src: imgUrl(p.id, 'thumb'), score: p.reviewCount > 0 ? p.avgRating : null, comp: inComp.has(p.id), isNew: Date.now() - new Date(p.addedAt).getTime() < 7 * 864e5 && p.reviewCount === 0, missing: !p.camera, dayLabel: dayLabel(p.capturedAt) }));

  const place = async (r: ScanResult, o: { mode: string; name: string; existingId: number | null; split: boolean }) => {
    if (!r.shootId || r.imported === 0) return;
    if (o.mode === 'existing' && o.existingId) { const ids = (await api<{ photos: { id: number }[] }>(`/photos?shoot=${r.shootId}`)).photos.map((p) => p.id); await api(`/shoots/${o.existingId}/move`, { body: { photoIds: ids } }); return; }
    const nm = o.name || r.shootName || todayName();
    await api(`/shoots/${r.shootId}`, { method: 'PATCH', body: { name: nm } });
    if (o.split) await api(`/shoots/${r.shootId}/split-by-day`, { body: { name: nm } }).catch(() => undefined);
  };

  const days = new Set(files.map((f) => new Date(f.lastModified).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })));
  const suggestName = files.length ? (days.size === 1 ? [...days][0] : `${[...days][0]} – ${[...days].pop()}`) : '';
  const mb = files.reduce((n, f) => n + f.size, 0) / 1e6;

  return (
    <div className="page-shell">
      <Header />
      <input ref={input} type="file" multiple hidden accept="image/*,.heic,.tif,.tiff,.raw,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2" onChange={(e) => { setFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <ProtoShoots
        uploadReq={req} localOn={local} cloudOn={cloudOn} today={todayName()}
        files={files} onFiles={setFiles} pickFiles={() => input.current?.click()} filesMeta={files.length ? `${mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : Math.round(mb) + ' MB'} · ${suggestName}` : ''} suggestName={suggestName}
        storageSub={`To your library on this server`} cloudHint={conns.length ? conns.map((c) => c.provider).join(', ') : ''}
        conns={conns.map((c) => ({ id: c.id, icon: (PROVIDER[c.provider] ?? [c.provider.slice(0, 2), c.provider])[0], name: (PROVIDER[c.provider] ?? [c.provider, c.provider])[1], where: c.account }))}
        existing={all.slice(0, 8).map((s) => ({ id: s.id, name: s.name, meta: `${s.count} photos`, src: s.coverId ? imgUrl(s.coverId, 'thumb') : '' }))}
        onUpload={async (o: { mode: string; name: string; split: boolean; existingId: number | null }, onProgress: (n: number) => void) => {
          await send(files, onProgress);
          const out = await waitScan();
          if (out) await place(out, o);
          reloadAll();
          return { imported: out?.imported ?? 0, name: o.mode === 'new' ? o.name || out?.shootName || todayName() : '' };
        }}
        onCloudSync={async (ids: string[]) => { for (const c of ids) await api(`/cloud/${c}/sync?wait=1`, { method: 'POST', body: {} }); const out = await waitScan(); return { imported: out?.imported ?? 0, shootId: out?.shootId ?? null, shootName: out?.shootName ?? null }; }}
        onCloudPlace={async (o: { shootId: number | null; mode: string; name: string; existingId: number | null; split: boolean }) => { if (o.shootId) await place({ shootId: o.shootId, imported: 1, duplicates: 0, shootName: null }, o); reloadAll(); }}
        thumb={(pid: number) => imgUrl(pid, 'thumb')}
        shoots={shown.map((s) => ({ id: s.id, name: s.name, count: s.count, place: s.place || '', dates: s.dates, pct: `${Math.round(s.reviewPct)}%`, src: s.coverId ? imgUrl(s.coverId, 'thumb') : '', ...tagFor(s) }))}
        countLine={`${all.length} shoots · ${totalPhotos.toLocaleString()} photos`}
        pendingN={pending.data?.count ?? 0} importLabel={importing ? 'Importing…' : `Import ${pending.data?.count ?? 0}`}
        importPending={async () => { setImporting(true); try { await waitScan(); } finally { setImporting(false); reloadAll(); } }}
        sugg={s0 && !dismissed ? { name: s0.name ?? s0.groups[0]?.name ?? 'A shoot', n: s0.groups.length, accept: async () => { for (const g of s0.groups) await api('/shoots', { body: { name: g.name, photoIds: g.photoIds } }); reloadAll(); }, dismiss: () => setDismissed(true) } : null}
        q={q} onQ={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} orderLabel={newest ? 'Newest' : 'Oldest'} toggleOrder={() => setNewest(!newest)}
        chips={[{ label: `Not in a composition · ${nUncomposed}`, on: filter === 'uncomposed', go: () => setFilter(filter === 'uncomposed' ? '' : 'uncomposed') }, { label: `Needs review · ${nReview}`, on: filter === 'review', go: () => setFilter(filter === 'review' ? '' : 'review') }]}
        yearLabel={years[0] ?? ''} yearMeta={`${all.length} shoots${years.length > 1 ? ' · ' + years.slice(1, 5).join(' · ') + (years.length > 5 ? ' · earlier' : '') : ''}`}
        onOpenShoot={(i: number) => nav(`/shoots/${i}`)} onCloseShoot={() => nav('/shoots')}
        shoot={view} shootPhotos={viewPhotos} onOpenPhoto={(pid: number) => nav(`/photo/${pid}`)}
        moveTargets={all.map((s) => ({ id: s.id, name: s.name, meta: `${s.count} photos · ${s.dates}`, src: s.coverId ? imgUrl(s.coverId, 'thumb') : '' }))}
        onMove={async (ids: number[], m: { mode: string; name: string; shootId: number | null }) => {
          let dest = '';
          if (m.mode === 'new') { const s = await api<Shoot>('/shoots', { body: { name: m.name || todayName(), photoIds: ids } }); dest = s.name; } else { await api(`/shoots/${m.shootId}/move`, { body: { photoIds: ids } }); dest = all.find((s) => s.id === m.shootId)?.name ?? ''; }
          reloadAll(); return dest;
        }}
        onRename={async (name: string) => { await api(`/shoots/${sid}`, { method: 'PATCH', body: { name } }); shoots.reload(); }}
        aiOn={!!settings && settings.ai !== 'off'}
        onAnalyse={async () => { try { await api('/ai/run', { method: 'POST', body: {} }); return 'Analysis started · suggestions arrive in To do'; } catch (e) { return (e as Error).message; } }}
        onStartReview={async () => { await api('/review/start', { body: { photoIds: ph.filter((p) => p.reviewCount === 0).map((p) => p.id) } }); nav('/review'); }}
        onCompose={() => openNew({ name: sh?.name, photoIds: ph.map((p) => p.id) })}
      />
    </div>
  );
}
