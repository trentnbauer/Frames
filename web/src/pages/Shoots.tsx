import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUi } from '../ui';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading } from '../components/bits';
import { useStore } from '../store';
import { AddPhotosButton } from '../components/AddPhotos';

type Pending = { count: number; folders: { folder: string; count: number }[]; lastScan: string | null };
type ScanResult = { shootId?: number | null; imported: number; duplicates: number; relinked: number; changed: number; errors: { file: string; error: string }[]; shootName: string | null };
type Suggestion = { shootId: number; shootName: string; groups: { name: string; reason: string; photoIds: number[] }[] };

export function Shoots() {
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<Pending>('/library/pending');
  const suggestions = useApi<Suggestion[]>('/shoots/suggestions');
  const { refreshSummary, me, summary } = useStore();
  const cloudOnly = !!me?.cloudOnly; // the administrator requires originals to be kept in cloud storage
  const { openNew } = useUi();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [uploaded, setUploaded] = useState<{ saved: string[]; rejected: { file: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = () => { shoots.reload(); pending.reload(); suggestions.reload(); refreshSummary(); };

  const sync = async () => {
    setBusy(true); setError(null); setProgress(null);
    try {
      await api('/library/scan', { method: 'POST', body: {} });
      // The sync runs on the server; poll until it finishes.
      for (;;) {
        const s = await api<{ running: boolean; done: number; total: number; result: ScanResult | null; error: string | null }>('/library/scan/status');
        setProgress({ done: s.done, total: s.total });
        if (!s.running) { if (s.error) throw new Error(s.error); setResult(s.result); break; }
        await new Promise((r) => setTimeout(r, 700));
      }
      refreshAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(null); }
  };

  const [find, setFind] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'name'>('new');
  const [noComp, setNoComp] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [openSplit, setOpenSplit] = useState<number | null>(null);
  const colls = useApi<{ photoIds: number[]; printedAt: string | null }[]>('/collections');
  const lib = useApi<{ photos: { id: number; shootId: number }[] }>('/photos');
  // How many compositions hold at least one photograph of each shoot.
  const comps = new Map<number, number>();
  if (colls.data && lib.data) { const of = new Map(lib.data.photos.map((p) => [p.id, p.shootId])); for (const c of colls.data) for (const sh of new Set(c.photoIds.map((id) => of.get(id)).filter((v): v is number => v !== undefined))) comps.set(sh, (comps.get(sh) ?? 0) + 1); }
  const all = shoots.data ?? [];
  const notComposed = all.filter((x) => !comps.get(x.id)).length;
  const needsReview = all.filter((x) => x.reviewPct < 100).length;
  const q = find.trim().toLowerCase();
  const yearOf = (x: Shoot) => (x.dateFrom ?? x.importedAt ?? '').slice(0, 4) || 'Undated';
  const shown = all.filter((x) => (!q || `${x.name} ${x.place} ${x.dates} ${yearOf(x)}`.toLowerCase().includes(q)) && (!noComp || !comps.get(x.id)) && (!needs || x.reviewPct < 100))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : ((a.dateFrom ?? a.importedAt ?? '').localeCompare(b.dateFrom ?? b.importedAt ?? '')) * (sort === 'new' ? -1 : 1)));
  const years = [...shown.reduce((m, x) => m.set(yearOf(x), [...(m.get(yearOf(x)) ?? []), x]), new Map<string, Shoot[]>())];
  const accept = async (g: Suggestion['groups'][number]) => { await api('/shoots', { body: { name: g.name, photoIds: g.photoIds } }); refreshAll(); };
  const p = pending.data;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1 }}>Photoshoots</h1>
          {shoots.data && <span className="muted" style={{ fontSize: 13 }}>{shoots.data.length} {shoots.data.length === 1 ? 'shoot' : 'shoots'} · {shoots.data.reduce((n, x) => n + x.count, 0).toLocaleString()} photographs</span>}
        </div>
        <AddPhotosButton big onDone={refreshAll} />
      </div>
      {cloudOnly && <p className="muted" style={{ fontSize: 13, margin: '-12px 0 24px' }}>Originals are kept in cloud storage on this server, so uploads are turned off. Connect a folder under <Link to="/settings?section=cloud-sync" style={{ textDecoration: 'underline' }}>Settings</Link>.</p>}
      {error && <div className="banner" role="alert"><span className="reason">{error}</span></div>}
      {p && p.count > 0 && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', borderRadius: 12, padding: '14px 20px', marginBottom: 8 }}>
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text)', flex: 'none' }} />
          <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 500 }}>{p.count} new file{p.count === 1 ? '' : 's'}</b> <span className="muted">in your library folder</span></span>
          {p.lastScan && <span className="faint" style={{ fontSize: 13 }}>Synced {fmtDate(p.lastScan, { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn outline" onClick={sync} disabled={busy}>{busy ? (progress && progress.total ? `Importing ${progress.done} / ${progress.total}` : 'Importing…') : `Import ${p.count}`}</button>
        </div>
      )}
      {uploaded && (
        <div className="banner" role="status">
          <span>Uploaded <b>{uploaded.saved.length}</b> {uploaded.saved.length === 1 ? 'file' : 'files'}.{uploaded.rejected.length > 0 && <span className="reason"> Not added: {uploaded.rejected.map((r) => `${r.file} (${r.reason})`).join(', ')}.</span>}</span>
          <button className="pill" onClick={() => setUploaded(null)}>Dismiss</button>
        </div>
      )}
      {result && (
        <div className="banner" role="status">
          <span>
            Imported <b>{result.imported}</b> {result.imported === 1 ? 'photo' : 'photos'}{result.shootName && result.imported > 0 && <> into <b>{result.shootName}</b></>}.
            {result.changed > 0 && <span className="muted"> {result.changed} edited {result.changed === 1 ? 'file was' : 'files were'} refreshed.</span>}
            {result.duplicates > 0 && <span className="muted"> {result.duplicates} exact {result.duplicates === 1 ? 'duplicate' : 'duplicates'} skipped.</span>}
            {result.relinked > 0 && <span className="muted"> {result.relinked} moved {result.relinked === 1 ? 'file was' : 'files were'} reconnected to existing photos.</span>}
            {result.errors.length > 0 && <span className="reason"> {result.errors.length} could not be read: {result.errors.slice(0, 3).map((e) => e.file).join(', ')}.</span>}
          </span>
          <button className="pill" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      {(suggestions.data ?? []).filter((x) => !dismissed.includes(x.shootId)).map((x) => (
        <div key={x.shootId} style={{ borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: '9px 20px', marginBottom: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{x.shootName}</b> <span className="muted">looks like {x.groups.length} shoots.</span></span>
            <button onClick={() => setOpenSplit(openSplit === x.shootId ? null : x.shootId)}>Review split →</button>
            <button aria-label="Dismiss" className="muted" onClick={() => setDismissed((d) => [...d, x.shootId])}>✕</button>
          </div>
          {openSplit === x.shootId && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{x.groups.map((g) => <button key={g.name} className="btn outline" style={{ height: 32 }} onClick={() => accept(g)} title={g.reason}>Split off “{g.name}” ({g.photoIds.length})</button>)}</div>}
        </div>
      ))}
      {(shoots.loading || shoots.error) && <Loading error={shoots.error} />}
      {shoots.data?.length === 0 && <div className="empty">No photoshoots yet. Put photographs in your library folder and press Sync library, or upload some.</div>}
      {shoots.data && shoots.data.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '28px 0 24px', flexWrap: 'wrap' }}>
          <input className="field-in" style={{ width: 360, height: 40, borderRadius: 999, background: 'var(--surface)', boxShadow: 'none' }} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a shoot, place or year" aria-label="Find a shoot, place or year" />
          <select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old' | 'name')} aria-label="Sort" style={{ height: 36, borderRadius: 999, background: 'var(--surface)', boxShadow: 'none' }}><option value="new">Newest</option><option value="old">Oldest</option><option value="name">Name</option></select>
          <button aria-pressed={noComp} className="chip" style={{ height: 36, padding: '0 14px', background: noComp ? 'var(--chip)' : 'var(--surface)', fontSize: 13.5 }} onClick={() => setNoComp(!noComp)}>Not in a composition · {notComposed}</button>
          <button aria-pressed={needs} className="chip" style={{ height: 36, padding: '0 14px', background: needs ? 'var(--chip)' : 'var(--surface)', fontSize: 13.5 }} onClick={() => setNeeds(!needs)}>Needs review · {needsReview}</button>
        </div>
      )}
      {years.map(([y, list]) => (
        <section key={y} style={{ marginBottom: 36 }}>
          <div className="spread" style={{ alignItems: 'baseline', paddingBottom: 8, borderBottom: '1px solid var(--hair)', marginBottom: 14 }}>
            <h2 className="serif" style={{ fontSize: 24, margin: 0 }}>{y}</h2>
            <span className="faint" style={{ fontSize: 13 }}>{list.length} shoots{years.length > 1 ? ` · ${years.filter(([k]) => k !== y).map(([k]) => k).join(' · ')}` : ''}</span>
          </div>
          <div className="shoot-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '24px 12px' }}>{list.map((x) => <ShootCard key={x.id} s={x} inComps={comps.get(x.id) ?? 0} fresh={result?.shootId === x.id ? result.imported : 0} />)}</div>
        </section>
      ))}
    </div>
  );
}

function ShootCard({ s, inComps, fresh }: { s: Shoot; inComps: number; fresh: number }) {
  const chip = fresh ? `${fresh} new` : inComps > 0 ? `In ${inComps} composition${inComps === 1 ? '' : 's'}` : s.reviewPct < 100 && s.reviewPct >= 0 && s.sessions > 0 && s.reviewPct < 100 ? 'Needs review' : 'Not composed';
  return (
    <Link to={`/shoots/${s.id}`} style={{ display: 'block', textAlign: 'left' }}>
      <div style={{ position: 'relative', aspectRatio: '1.6', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)', marginBottom: 10 }}>
        {s.coverId && <Img p={{ id: s.coverId, ar: 1.6 }} style={{ aspectRatio: '1.6', width: '100%', height: '100%' }} />}
        <span style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'rgba(13,13,13,.72)', color: '#efede8' }}>{chip}</span>
      </div>
      <div className="spread" style={{ alignItems: 'baseline' }}><span className="serif" style={{ fontSize: 20 }}>{s.name}</span><span className="faint" style={{ fontSize: 12.5 }}>{s.count}</span></div>
      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{[s.place, s.dates].filter(Boolean).join(' · ')}</div>
    </Link>
  );
}

