import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { checkTarget, parseTarget, requiredPx, type Collection, type PhotoLite, type Target } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';
import { SharePanel } from '../components/SharePanel';

type SuggestedSet = { name: string; reason: string; aiAssisted: boolean; photoIds: number[]; photos: PhotoLite[] };
type Insights = {
  repetitive: { photoIds: number[] }[];
  alternatives: { forId: number; reason: string; candidates: PhotoLite[] }[];
  complementary: PhotoLite[];
  aiAssisted: boolean;
};

export function Collections() {
  const colls = useApi<Collection[]>('/collections');
  const sets = useApi<SuggestedSet[]>('/collections/suggestions');
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const create = async () => { if (name.trim()) nav(`/collections/${(await api<Collection>('/collections', { body: { name } })).id}`); };
  const start = async (s: SuggestedSet) => {
    const c = await api<Collection>('/collections', { body: { name: s.name, photoIds: s.photoIds } });
    await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s.photoIds, verdict: 'accept' } });
    nav(`/collections/${c.id}`);
  };
  const skip = async (s: SuggestedSet) => { await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s.photoIds, verdict: 'reject' } }); sets.reload(); };
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
      {colls.data?.length === 0 && <div className="empty">No collections yet. A collection is a curated set of photographs you can download as untouched original files.</div>}
      <div className="card-grid">
        {colls.data?.map((c) => (
          <Link key={c.id} to={`/collections/${c.id}`}>
            <div className="cover">{c.photoIds[0] && <Img p={{ id: c.photoIds[0], ar: 2.2 }} style={{ aspectRatio: '2.2', width: '100%', height: '100%' }} />}</div>
            <div className="spread"><h2 className="serif" style={{ fontSize: 22 }}>{c.name}</h2><span className="muted" style={{ fontSize: 12.5 }}>{c.photoIds.length}</span></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{[c.theme, c.target ? targetLabel(c.target) : 'No target'].filter(Boolean).join(' · ')}</div>
          </Link>
        ))}
      </div>
      {(sets.data ?? []).length > 0 && (
        <section style={{ marginTop: 48 }}>
          <h2 className="serif" style={{ fontSize: 28, marginBottom: 4 }}>Suggested collections</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>Well-liked photographs from different photoshoots that look like they belong together.</p>
          {sets.data!.map((s) => (
            <div className="fy" key={s.photoIds.join('-')}>
              <div className="spread"><h3 className="serif" style={{ fontSize: 22, margin: 0 }}>{s.name}</h3><span className="muted" style={{ fontSize: 12 }}>{s.reason}{s.aiAssisted && ' · AI-assisted'}</span></div>
              <div className="strip" style={{ height: 120, marginTop: 10 }}>{s.photos.map((p) => <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}><Img p={p} style={{ height: '100%', width: 'auto' }} /></Link>)}</div>
              <div className="acts"><button className="pill primary" onClick={() => start(s)}>Start this collection</button><button className="pill" onClick={() => skip(s)}>Not for me</button></div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const targetLabel = (t: Target) => [t.count > 1 ? `${t.count} ×` : '', t.size === 'none' ? 'pixels only' : t.size === 'custom' ? `${t.widthMm}×${t.heightMm} mm` : t.size, t.orientation !== 'any' ? t.orientation : '', `${t.ppi} PPI`].filter(Boolean).join(' ');

type Dl = { done: number; total: number; skipped: number; state: 'working' | 'ready' };

export function CollectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const coll = useApi<Collection>(`/collections/${id}`);
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const insights = useApi<Insights>(`/collections/${id}/insights`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dl, setDl] = useState<Dl | null>(null);
  const [cmp, setCmp] = useState<number[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const cancelled = useRef(false);

  const c = coll.data;
  if (!c) return <div className="page"><Header /><Loading error={coll.error} /></div>;
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const photos = c.photoIds.map((pid) => byId.get(pid)).filter((p): p is PhotoLite => !!p);
  const target = c.target;
  const save = async (patch: Record<string, unknown>) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: patch })); insights.reload(); };
  const addPhoto = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'PUT' })); insights.reload(); };
  const removePhoto = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'DELETE' })); insights.reload(); };
  const mb = photos.reduce((n, p) => n + p.sizeMb, 0);
  const types = [...new Set(photos.map((p) => p.fileType))].join(' + ');
  const req = target ? requiredPx(target) : null;

  const toggle = (pid: number) => {
    if (!target) return;
    const on = c.chosenIds.includes(pid);
    if (!on && c.chosenIds.length >= target.count) return;
    save({ chosenIds: on ? c.chosenIds.filter((x) => x !== pid) : [...c.chosenIds, pid] });
  };
  const move = (pid: number, d: number) => {
    const o = [...c.photoIds]; const i = o.indexOf(pid); const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    save({ order: o });
  };

  // Hands each original to the browser's own downloader, in collection order. The browser streams
  // every file straight to disk, so nothing is held in memory and the files are never altered.
  const download = async () => {
    const present = photos.filter((p) => !p.missing);
    const skipped = photos.length - present.length;
    const pad = String(present.length).length;
    cancelled.current = false;
    setDl({ done: 0, total: present.length, skipped, state: 'working' });
    for (let i = 0; i < present.length; i++) {
      if (cancelled.current) { setDl(null); return; }
      const a = document.createElement('a');
      a.href = `/api/photos/${present[i].id}/original?n=${i + 1}&pad=${pad}`;
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      setDl({ done: i + 1, total: present.length, skipped, state: 'working' });
      await new Promise((r) => setTimeout(r, 450)); // browsers drop downloads fired in the same instant
    }
    setDl({ done: present.length, total: present.length, skipped, state: 'ready' });
    setTimeout(() => setDl((z) => (z?.state === 'ready' ? null : z)), 8000);
  };

  const candidates = (lib.data?.photos ?? []).filter((p) => !c.photoIds.includes(p.id));
  const ins = insights.data;
  const repeatIds = new Set(ins?.repetitive.flatMap((g) => g.photoIds) ?? []);
  const hasInsights = !!ins && (ins.repetitive.length > 0 || ins.alternatives.length > 0 || ins.complementary.length > 0);

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ fontSize: 13, marginBottom: 20 }}>
        <Link to="/collections" className="t2">← Collections</Link>
        <span className="t2" style={{ display: 'flex', gap: 18 }}>
          <button onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share</button>
          <button onClick={() => setCmp(cmp ? null : [])}>{cmp ? 'Cancel compare' : 'Compare'}</button>
          <button onClick={() => setAdding(!adding)}>{adding ? 'Done adding' : 'Add photos'}</button>
          <button onClick={async () => { if (confirm(`Delete “${c.name}”? The photographs themselves are not touched.`)) { await api(`/collections/${c.id}`, { method: 'DELETE' }); nav('/collections'); } }}>Delete</button>
        </span>
      </div>
      {sharing && <SharePanel kind="collection" id={c.id} onClose={() => setSharing(false)} />}
      {dl && (
        <div className="toast" role="status">
          <b>{dl.state === 'ready' ? 'Downloads started' : 'Downloading originals'}</b>
          <div className="bar"><i style={{ width: `${dl.total ? (dl.done / dl.total) * 100 : 0}%` }} /></div>
          <div className="muted" style={{ fontSize: 12 }}>
            {dl.state === 'ready' ? `${dl.total} files sent to your browser’s downloads, in order · ` : `${dl.done} of ${dl.total} · `}originals, unmodified
            {dl.skipped > 0 && <span className="reason"> {dl.skipped} could not be included because the original file is missing.</span>}
          </div>
          {dl.state === 'working' && <button className="t2" style={{ fontSize: 12, marginTop: 6 }} onClick={() => { cancelled.current = true; }}>Cancel</button>}
        </div>
      )}
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="serif inline" aria-label="Collection name" defaultValue={c.name} key={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && save({ name: e.target.value })} style={{ fontSize: 52, lineHeight: 1 }} />
          <input aria-label="Theme" className="t2 inline" placeholder="Theme (for example: quiet light)" defaultValue={c.theme} onBlur={(e) => e.target.value !== c.theme && save({ theme: e.target.value })} style={{ fontSize: 13.5, marginTop: 8 }} />
          <input aria-label="Description" className="t2 inline" placeholder="Add a description" defaultValue={c.description} onBlur={(e) => e.target.value !== c.description && save({ description: e.target.value })} style={{ fontSize: 13.5, marginTop: 4 }} />
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <button className="pill primary big" onClick={download} disabled={photos.length === 0 || dl?.state === 'working'}>Download files</button>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{photos.length} originals{types && ` · ${types}`} · {mb} MB · in order</div>
        </div>
      </div>

      <div className="target">
        <span className="label">Target</span>
        {target ? (
          <>
            <span><b>{targetLabel(target)}</b>{req && <>, so at least <b>{req[0]} × {req[1]} px</b> each</>}{(target.minWidth || target.minHeight) && <>, minimum <b>{target.minWidth ?? '–'} × {target.minHeight ?? '–'} px</b></>}{target.aspect && <>, aspect <b>{target.aspect}</b> ({target.aspectMode})</>}</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {Array.from({ length: Math.min(target.count, 40) }, (_, i) => <i key={i} className={'slot' + (i < c.chosenIds.length ? ' on' : '')} />)}
              <span className="muted" style={{ marginLeft: 6 }}>{c.chosenIds.length} of {target.count} chosen · {photos.length} candidates</span>
            </span>
          </>
        ) : <span className="t2">No target</span>}
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
            {candidates.slice(0, 80).map((p) => (
              <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 110}px`, aspectRatio: String(p.ar) }} aria-label={`Add ${p.title}`} onClick={() => addPhoto(p.id)}><Img p={p} /></button>
            ))}
            <i />
          </div>
          {candidates.length === 0 && <div className="empty">Every photograph is already here.</div>}
        </div>
      )}

      {cmp && (
        <div className="banner" role="status">
          <span>{cmp.length < 2 ? `Choose ${2 - cmp.length} more photograph${cmp.length === 1 ? '' : 's'} to compare.` : 'Ready to compare.'}</span>
          {cmp.length === 2 && <Link className="pill primary" to={`/compare?a=${cmp[0]}&b=${cmp[1]}`}>Compare side by side</Link>}
        </div>
      )}
      {photos.length === 0 && !adding && <div className="empty">This collection is empty. Use Add photos, or Add to collection on a photograph.</div>}
      <div className="cand-wrap">
        <div className="cands">
          {photos.map((p) => {
            const { problem, note } = checkTarget(p, target);
            const on = c.chosenIds.includes(p.id);
            const inCmp = !!cmp?.includes(p.id);
            return (
              <div key={p.id}>
                <button className={'well' + (problem ? ' fail' : '') + (on || inCmp ? ' chosen' : '')} style={{ width: '100%' }} aria-pressed={on || inCmp}
                  onClick={() => (cmp ? setCmp(inCmp ? cmp.filter((x) => x !== p.id) : cmp.length < 2 ? [...cmp, p.id] : cmp) : !problem && toggle(p.id))}
                  aria-label={`${p.title}${problem ? ', does not meet target' : ''}`}>
                  <Img p={p} style={p.ar >= 1 ? { width: '100%', height: 'auto' } : { height: '100%', width: 'auto' }} />
                </button>
                {problem && <div className="reason">{problem}</div>}
                {!problem && note && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{note}</div>}
                {repeatIds.has(p.id) && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Looks like another photo here</div>}
                <div className="faint" style={{ fontSize: 12, display: 'flex', gap: 10, marginTop: 4 }}>
                  <button aria-label={`Move ${p.title} earlier`} onClick={() => move(p.id, -1)}>←</button>
                  <button aria-label={`Move ${p.title} later`} onClick={() => move(p.id, 1)}>→</button>
                  <button aria-label={`Remove ${p.title}`} onClick={() => removePhoto(p.id)}>remove</button>
                </div>
              </div>
            );
          })}
        </div>
        <aside className="notes">
          {!hasInsights && <div className="muted">Suggestions appear here once there are photographs to compare.</div>}
          {ins && ins.repetitive.length > 0 && (
            <div><h3>Nearly the same</h3>
              {ins.repetitive.map((g) => <div key={g.photoIds.join('-')} style={{ marginBottom: 8 }}>{g.photoIds.length} photographs look alike. <Link className="t2" style={{ textDecoration: 'underline' }} to={`/compare?a=${g.photoIds[0]}&b=${g.photoIds[1]}`}>Compare</Link></div>)}
            </div>
          )}
          {ins && ins.alternatives.length > 0 && (
            <div><h3>Alternatives</h3>
              {ins.alternatives.map((a) => (
                <div key={a.forId} style={{ marginBottom: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>For {byId.get(a.forId)?.title ?? 'a photo'} · {a.reason}</div>
                  <div className="alts">{a.candidates.map((p) => <button key={p.id} title={`${Math.round((p.similarity ?? 0) * 100)}% similar. Add it`} aria-label={`Add alternative ${p.title}`} onClick={() => addPhoto(p.id)}><Img p={p} style={{ height: 52, width: 'auto' }} /></button>)}</div>
                </div>
              ))}
            </div>
          )}
          {ins && ins.complementary.length > 0 && (
            <div><h3>Would sit well here{ins.aiAssisted && ' · AI-assisted'}</h3>
              <div className="alts">{ins.complementary.map((p) => <button key={p.id} title={`${Math.round((p.similarity ?? 0) * 100)}% match. Add it`} aria-label={`Add suggested ${p.title}`} onClick={() => addPhoto(p.id)}><Img p={p} style={{ height: 52, width: 'auto' }} /></button>)}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TargetForm({ t, onChange }: { t: Target | null; onChange: (t: Target) => void }) {
  const v = t ?? parseTarget({ size: 'A3', orientation: 'any', ppi: 300, count: 1 })!;
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const upd = (p: Partial<Target>) => onChange({ ...v, ...p } as Target);
  return (
    <div className="form" style={{ marginBottom: 24 }}>
      <label>Prints <input type="number" min={1} value={v.count} onChange={(e) => upd({ count: Math.max(1, Number(e.target.value) || 1) })} /></label>
      <label>Print size <select value={v.size} onChange={(e) => upd({ size: e.target.value as Target['size'] })}><option value="none">No print size</option><option>A4</option><option>A3</option><option>A2</option><option value="custom">Custom (mm)</option></select></label>
      {v.size === 'custom' && <>
        <label>Width mm <input type="number" min={10} value={v.widthMm ?? ''} onChange={(e) => upd({ widthMm: num(e.target.value) })} /></label>
        <label>Height mm <input type="number" min={10} value={v.heightMm ?? ''} onChange={(e) => upd({ heightMm: num(e.target.value) })} /></label>
      </>}
      <label>PPI <input type="number" min={72} max={1200} value={v.ppi} onChange={(e) => upd({ ppi: Math.max(72, Number(e.target.value) || 300) })} /></label>
      <label>Orientation <select value={v.orientation} onChange={(e) => upd({ orientation: e.target.value as Target['orientation'] })}><option value="any">either</option><option value="portrait">portrait</option><option value="landscape">landscape</option></select></label>
      <label>Min width px <input type="number" min={0} value={v.minWidth ?? ''} onChange={(e) => upd({ minWidth: num(e.target.value) })} /></label>
      <label>Min height px <input type="number" min={0} value={v.minHeight ?? ''} onChange={(e) => upd({ minHeight: num(e.target.value) })} /></label>
      <label>Aspect ratio <input key={v.aspect ?? ''} defaultValue={v.aspect ?? ''} placeholder="3:2" style={{ width: 70 }} aria-label="Aspect ratio" onBlur={(e) => e.target.value !== (v.aspect ?? '') && upd({ aspect: e.target.value || undefined })} /></label>
      {v.aspect && <label><select aria-label="Aspect ratio is" value={v.aspectMode ?? 'preferred'} onChange={(e) => upd({ aspectMode: e.target.value as 'preferred' | 'required' })}><option value="preferred">preferred</option><option value="required">required</option></select></label>}
    </div>
  );
}
