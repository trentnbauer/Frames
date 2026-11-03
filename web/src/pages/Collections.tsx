import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COLLECTIONS, photoById, requiredPx, targetProblem, type Target } from '../data';
import { Header, Img, Title } from '../components/bits';
import { useStore } from '../store';

export function Collections() {
  return (
    <div className="page">
      <Header />
      <Title count={`${COLLECTIONS.length} collections`}>Collections</Title>
      <div className="card-grid">
        {COLLECTIONS.map((c) => (
          <Link key={c.id} to={`/collections/${c.id}`}>
            <div className="cover"><Img p={{ ar: 2.2, hue: photoById(c.photoIds[0]).hue }} style={{ aspectRatio: '2.2' }} /></div>
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

export function CollectionDetail() {
  const { id } = useParams();
  const base = COLLECTIONS.find((c) => c.id === id) ?? COLLECTIONS[0];
  const { settings } = useStore();
  const ai = settings.ai !== 'off';
  const [target, setTarget] = useState<Target | null>(base.target);
  const [chosen, setChosen] = useState<number[]>(base.chosenIds);
  const [editing, setEditing] = useState(false);
  const [zip, setZip] = useState<number | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => clearInterval(timer.current), []);

  const photos = base.photoIds.map(photoById);
  const total = photos.length;
  const MB = photos.reduce((n, p) => n + p.sizeMb, 0);
  const types = [...new Set(photos.map((p) => p.fileType))].join(' + ');

  const download = () => {
    setZip(0);
    // Simulated. Real export streams the original files from the server.
    timer.current = window.setInterval(() => setZip((n) => {
      if (n === null) return null;
      if (n >= total) { clearInterval(timer.current); window.setTimeout(() => setZip(null), 1800); return n; }
      return n + 1;
    }), 350);
  };

  const [pw, ph] = target ? requiredPx(target.size, target.ppi) : [0, 0];
  const toggle = (pid: number) => {
    if (!target) return;
    setChosen((c) => (c.includes(pid) ? c.filter((x) => x !== pid) : c.length < target.count ? [...c, pid] : c));
  };
  const near = photos.find((p) => p.id === 14);

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ fontSize: 13, marginBottom: 20 }}>
        <Link to="/collections" className="t2">← Collections</Link>
        <span className="t2" style={{ display: 'flex', gap: 18 }}><span>Compare</span><span>Edit</span></span>
      </div>
      {zip !== null && (
        <div className="toast" role="status">
          <div className="spread"><b>{zip >= total ? 'ZIP ready' : 'Preparing ZIP'}</b></div>
          <div className="bar"><i style={{ width: `${(zip / total) * 100}%` }} /></div>
          <div className="muted" style={{ fontSize: 12 }}>{zip} of {total} · originals, unmodified</div>
        </div>
      )}
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="serif" style={{ fontSize: 52, lineHeight: 1 }}>{base.name}</h1>
          <p className="t2" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{base.description}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button className="pill primary big" onClick={download}>Download ZIP</button>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{total} originals · {types} · {MB} MB · in order</div>
        </div>
      </div>

      <div className="target">
        <span className="label">Target</span>
        {target ? (
          <>
            <span><b>{target.count} × {target.size} prints, {target.orientation}</b>, {target.ppi} PPI, so at least <b>{pw} × {ph} px</b> each</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {Array.from({ length: target.count }, (_, i) => <i key={i} className={'slot' + (i < chosen.length ? ' on' : '')} />)}
              <span className="muted" style={{ marginLeft: 6 }}>{chosen.length} of {target.count} chosen · {total} candidates</span>
            </span>
          </>
        ) : (
          <span className="t2">No target</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }} className="t2">
          <button onClick={() => setEditing(!editing)}>{target ? 'Change target' : 'Add target'}</button>
          {target && <button onClick={() => { setTarget(null); setEditing(false); }}>No target</button>}
        </span>
      </div>

      {editing && <TargetForm t={target} onChange={(t) => setTarget(t)} />}

      <div className="cand-wrap">
        <div className="cands">
          {photos.map((p) => {
            const why = targetProblem(p, target);
            const on = chosen.includes(p.id);
            return (
              <div key={p.id}>
                <button className={'well' + (why ? ' fail' : '') + (on ? ' chosen' : '')} style={{ width: '100%' }} onClick={() => !why && toggle(p.id)} aria-pressed={on} aria-label={`${p.title}${why ? ', does not meet target' : ''}`}>
                  <Img p={p} style={p.ar >= 1 ? { width: '100%', height: 'auto' } : { height: '100%', width: 'auto' }} />
                </button>
                {why && <div className="reason">{why}</div>}
              </div>
            );
          })}
        </div>
        {ai ? (
          <aside className="notes">
            <div><h3>Nearly the same</h3>{near ? `${near.title} and one more are close to duplicates. ` : ''}<span className="t2" style={{ textDecoration: 'underline' }}>Compare</span></div>
            <div><h3>Would sit well here</h3>Three portrait frames from Winter orchard share the same cool palette.</div>
            <div><h3>Alternative for 11</h3>A higher-resolution frame from the same moment meets the target.</div>
          </aside>
        ) : (
          <aside className="notes"><div className="muted">AI is off. Suggestions are hidden.</div></aside>
        )}
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
