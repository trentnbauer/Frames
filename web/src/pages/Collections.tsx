import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { requiredPx, targetProblem, type Collection, type PhotoLite, type Target } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';
import { useStore } from '../store';

export function Collections() {
  const colls = useApi<Collection[]>('/collections');
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    const c = await api<Collection>('/collections', { body: { name } });
    nav(`/collections/${c.id}`);
  };
  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
        <Title count={colls.data ? `${colls.data.length} ${colls.data.length === 1 ? 'collection' : 'collections'}` : undefined}>Collections</Title>
        <button className="pill" onClick={() => setNaming(!naming)}>New collection</button>
      </div>
      {naming && (
        <form className="form" style={{ marginBottom: 24 }} onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" aria-label="Collection name" style={{ width: 280 }} />
          <button className="pill primary">Create</button>
        </form>
      )}
      {(colls.loading || colls.error) && <Loading error={colls.error} />}
      {colls.data?.length === 0 && <div className="empty">No collections yet. A collection is a curated set of photographs you can export as a ZIP.</div>}
      <div className="card-grid">
        {colls.data?.map((c) => (
          <Link key={c.id} to={`/collections/${c.id}`}>
            <div className="cover">{c.photoIds[0] && <Img p={{ id: c.photoIds[0], ar: 2.2 }} style={{ aspectRatio: '2.2', width: '100%', height: '100%' }} />}</div>
            <div className="spread"><h2 className="serif" style={{ fontSize: 22 }}>{c.name}</h2><span className="muted" style={{ fontSize: 12.5 }}>{c.photoIds.length}</span></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {c.target ? `${c.target.count} × ${c.target.size} · ${c.target.orientation} · ${c.target.ppi} PPI` : 'No target'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

type Zip = { done: number; total: number; skipped: number; state: 'working' | 'ready' | 'failed' };

export function CollectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useStore();
  const coll = useApi<Collection>(`/collections/${id}`);
  const lib = useApi<{ photos: PhotoLite[] }>('/photos?archived=all');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [zip, setZip] = useState<Zip | null>(null);
  const abort = useRef<AbortController>();

  const c = coll.data;
  if (!c) return <div className="page"><Header /><Loading error={coll.error} /></div>;
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const photos = c.photoIds.map((pid) => byId.get(pid)).filter((p): p is PhotoLite => !!p);
  const target = c.target;
  const save = async (patch: Record<string, unknown>) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: patch })); };
  const bytes = photos.reduce((n, p) => n + p.sizeMb, 0);
  const types = [...new Set(photos.map((p) => p.fileType))].join(' + ');
  const [pw, ph] = target ? requiredPx(target.size, target.ppi) : [0, 0];
  const ai = !!settings && settings.ai !== 'off';

  const toggle = (pid: number) => {
    if (!target) return;
    const on = c.chosenIds.includes(pid);
    if (!on && c.chosenIds.length >= target.count) return;
    save({ chosenIds: on ? c.chosenIds.filter((x) => x !== pid) : [...c.chosenIds, pid] });
  };
  const move = (pid: number, d: number) => {
    const o = [...c.photoIds];
    const i = o.indexOf(pid);
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    save({ order: o });
  };

  // Streams the ZIP, reading the response so progress is real bytes, then hands the blob to the browser.
  const download = async () => {
    abort.current = new AbortController();
    setZip({ done: 0, total: photos.length, skipped: 0, state: 'working' });
    try {
      const r = await fetch(`/api/collections/${c.id}/zip`, { signal: abort.current.signal });
      if (!r.ok || !r.body) throw new Error('export failed');
      const totalBytes = Number(r.headers.get('X-Total-Bytes')) || 0;
      const skipped = Number(r.headers.get('X-Skipped')) || 0;
      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        setZip({ done: totalBytes ? Math.min(photos.length, Math.floor((got / totalBytes) * (photos.length - skipped))) : 0, total: photos.length - skipped, skipped, state: 'working' });
      }
      const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${c.name}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setZip({ done: photos.length - skipped, total: photos.length - skipped, skipped, state: 'ready' });
      setTimeout(() => setZip((z) => (z?.state === 'ready' ? null : z)), 6000);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setZip({ done: 0, total: photos.length, skipped: 0, state: 'failed' });
      else setZip(null);
    }
  };

  const candidates = (lib.data?.photos ?? []).filter((p) => !c.photoIds.includes(p.id));
  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ fontSize: 13, marginBottom: 20 }}>
        <Link to="/collections" className="t2">← Collections</Link>
        <span className="t2" style={{ display: 'flex', gap: 18 }}>
          <button onClick={() => setAdding(!adding)}>{adding ? 'Done adding' : 'Add photos'}</button>
          <button onClick={async () => { if (confirm(`Delete “${c.name}”? The photographs themselves are not touched.`)) { await api(`/collections/${c.id}`, { method: 'DELETE' }); nav('/collections'); } }}>Delete</button>
        </span>
      </div>
      {zip && (
        <div className="toast" role="status">
          <b>{zip.state === 'ready' ? 'ZIP ready' : zip.state === 'failed' ? 'Export failed' : 'Preparing ZIP'}</b>
          <div className="bar"><i style={{ width: `${zip.total ? (zip.done / zip.total) * 100 : 0}%` }} /></div>
          <div className="muted" style={{ fontSize: 12 }}>
            {zip.state === 'failed' ? 'Nothing was changed. Try again.' : `${zip.done} of ${zip.total} · originals, unmodified`}
            {zip.skipped > 0 && <span className="reason"> {zip.skipped} could not be included. See NOT_INCLUDED.txt in the ZIP.</span>}
          </div>
          {zip.state === 'working' && <button className="t2" style={{ fontSize: 12, marginTop: 6 }} onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
      )}
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <input className="serif" aria-label="Collection name" defaultValue={c.name} key={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && save({ name: e.target.value })} style={{ fontSize: 52, lineHeight: 1, background: 'none', border: 0, outline: 'none', width: '100%' }} />
          <input aria-label="Description" className="t2" placeholder="Add a description" defaultValue={c.description} onBlur={(e) => e.target.value !== c.description && save({ description: e.target.value })} style={{ fontSize: 13.5, background: 'none', border: 0, outline: 'none', width: '100%', marginTop: 8 }} />
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <button className="pill primary big" onClick={download} disabled={photos.length === 0 || zip?.state === 'working'}>Download ZIP</button>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{photos.length} originals{types && ` · ${types}`} · {bytes} MB · in order</div>
        </div>
      </div>

      <div className="target">
        <span className="label">Target</span>
        {target ? (
          <>
            <span><b>{target.count} × {target.size} prints, {target.orientation}</b>, {target.ppi} PPI, so at least <b>{pw} × {ph} px</b> each</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {Array.from({ length: target.count }, (_, i) => <i key={i} className={'slot' + (i < c.chosenIds.length ? ' on' : '')} />)}
              <span className="muted" style={{ marginLeft: 6 }}>{c.chosenIds.length} of {target.count} chosen · {photos.length} candidates</span>
            </span>
          </>
        ) : (
          <span className="t2">No target</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }} className="t2">
          <button onClick={() => setEditing(!editing)}>{target ? 'Change target' : 'Add target'}</button>
          {target && <button onClick={() => { save({ target: null }); setEditing(false); }}>No target</button>}
        </span>
      </div>
      {editing && <TargetForm t={target} onChange={(t) => save({ target: t })} />}

      {adding && (
        <div style={{ marginBottom: 32 }}>
          <div className="label" style={{ marginBottom: 10 }}>Choose photographs to add</div>
          <div className="just">
            {candidates.slice(0, 60).map((p) => (
              <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 110}px`, aspectRatio: String(p.ar) }} aria-label={`Add ${p.title}`} onClick={async () => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${p.id}`, { method: 'PUT' })); }}><Img p={p} /></button>
            ))}
            <i />
          </div>
          {candidates.length === 0 && <div className="empty">Every photograph is already here.</div>}
        </div>
      )}

      {photos.length === 0 && !adding && <div className="empty">This collection is empty. Use Add photos, or Add to collection on a photograph.</div>}
      <div className="cand-wrap">
        <div className="cands">
          {photos.map((p) => {
            const why = targetProblem(p, target);
            const on = c.chosenIds.includes(p.id);
            return (
              <div key={p.id}>
                <button className={'well' + (why ? ' fail' : '') + (on ? ' chosen' : '')} style={{ width: '100%' }} onClick={() => !why && toggle(p.id)} aria-pressed={on} aria-label={`${p.title}${why ? ', does not meet target' : ''}`}>
                  <Img p={p} kind="thumb" style={p.ar >= 1 ? { width: '100%', height: 'auto' } : { height: '100%', width: 'auto' }} />
                </button>
                {why && <div className="reason">{why}</div>}
                <div className="faint" style={{ fontSize: 12, display: 'flex', gap: 10, marginTop: 4 }}>
                  <button aria-label={`Move ${p.title} earlier`} onClick={() => move(p.id, -1)}>←</button>
                  <button aria-label={`Move ${p.title} later`} onClick={() => move(p.id, 1)}>→</button>
                  <button aria-label={`Remove ${p.title}`} onClick={async () => coll.set(await api<Collection>(`/collections/${c.id}/photos/${p.id}`, { method: 'DELETE' }))}>remove</button>
                </div>
              </div>
            );
          })}
        </div>
        <aside className="notes">
          {ai ? <div className="muted">Suggestions for this collection need the image analysis pipeline, which isn’t built yet.</div> : <div className="muted">AI is off. Suggestions are hidden.</div>}
        </aside>
      </div>
    </div>
  );
}

function TargetForm({ t, onChange }: { t: Target | null; onChange: (t: Target) => void }) {
  const v: Target = t ?? { count: 1, size: 'A3', orientation: 'any', ppi: 300 };
  return (
    <div className="form" style={{ marginBottom: 24 }}>
      <label>Prints <input type="number" min={1} value={v.count} onChange={(e) => onChange({ ...v, count: Math.max(1, Number(e.target.value) || 1) })} /></label>
      <label>Size <select value={v.size} onChange={(e) => onChange({ ...v, size: e.target.value as Target['size'] })}><option>A4</option><option>A3</option><option>A2</option></select></label>
      <label>Orientation <select value={v.orientation} onChange={(e) => onChange({ ...v, orientation: e.target.value as Target['orientation'] })}><option value="portrait">portrait</option><option value="landscape">landscape</option><option value="any">any</option></select></label>
      <label>PPI <input type="number" min={72} max={600} value={v.ppi} onChange={(e) => onChange({ ...v, ppi: Math.max(72, Number(e.target.value) || 300) })} /></label>
    </div>
  );
}
