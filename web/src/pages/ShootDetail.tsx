import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { Header, Img, Loading, useField } from '../components/bits';
import { SharePanel } from '../components/SharePanel';

export function ShootDetail() {
  const { id } = useParams();
  const shoot = useApi<Shoot>(`/shoots/${id}`);
  const all = useApi<Shoot[]>('/shoots');
  const photos = useApi<{ photos: PhotoLite[] }>(`/photos?shoot=${id}&order=oldest`);
  const s0 = shoot.data;
  // Each field follows the server only when its own value changes, so a refresh never wipes text typed in another.
  const [name, setName] = useField(s0?.name ?? '', s0?.id);
  const [place, setPlace] = useField(s0?.place ?? '', s0?.id);
  const [description, setDescription] = useField(s0?.description ?? '', s0?.id);
  const [dateFrom, setDateFrom] = useField(s0?.dateFrom ?? '', s0?.id);
  const [dateTo, setDateTo] = useField(s0?.dateTo ?? '', s0?.id);
  const f = { name, place, description, dateFrom, dateTo };
  const setF = (n: typeof f) => { setName(n.name); setPlace(n.place); setDescription(n.description); setDateFrom(n.dateFrom); setDateTo(n.dateTo); };
  const [select, setSelect] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [msg, setMsg] = useState('');
  const s = shoot.data;
  if (!s) return <div className="page"><Header /><Loading error={shoot.error} /></div>;
  const save = async (patch: Record<string, unknown>) => { await api(`/shoots/${s.id}`, { method: 'PATCH', body: patch }); shoot.reload(); };
  const move = async (to: number) => {
    await api(`/shoots/${to}/move`, { body: { photoIds: picked } });
    setMsg(`Moved ${picked.length} ${picked.length === 1 ? 'photograph' : 'photographs'}.`);
    setPicked([]); setSelect(false); shoot.reload(); photos.reload(); all.reload();
  };
  const list = photos.data?.photos ?? [];
  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ fontSize: 13, marginBottom: 14 }}>
        <Link to="/shoots" className="t2">← Photoshoots</Link>
        <span className="muted" style={{ display: 'flex', gap: 18 }}>{s.source} · imported {new Date(s.importedAt).toLocaleDateString('en-AU')}<button className="t2" onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share</button></span>
      </div>
      {sharing && <SharePanel kind="shoot" id={s.id} onClose={() => setSharing(false)} />}
      <input className="serif inline" aria-label="Photoshoot name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => f.name.trim() && f.name !== s.name && save({ name: f.name })} style={{ fontSize: 52, lineHeight: 1 }} />
      <div className="form" style={{ margin: '14px 0 6px' }}>
        <label>Place <input aria-label="Place" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} onBlur={() => f.place !== s.place && save({ place: f.place })} /></label>
        <label>From <input type="date" aria-label="From date" value={f.dateFrom} onChange={(e) => { setF({ ...f, dateFrom: e.target.value }); save({ dateFrom: e.target.value || null }); }} /></label>
        <label>To <input type="date" aria-label="To date" value={f.dateTo} onChange={(e) => { setF({ ...f, dateTo: e.target.value }); save({ dateTo: e.target.value || null }); }} /></label>
        <span className="muted">{s.dates} · {s.count} {s.count === 1 ? 'photograph' : 'photographs'}</span>
      </div>
      <textarea className="area" aria-label="Description" rows={2} placeholder="Describe this photoshoot" value={f.description} style={{ maxWidth: 640, marginBottom: 20 }} onChange={(e) => setF({ ...f, description: e.target.value })} onBlur={() => f.description !== s.description && save({ description: f.description })} />
      <div className="spread" style={{ marginBottom: 14 }}>
        <span className="muted" role="status" style={{ fontSize: 13 }}>{msg || (select ? `${picked.length} selected` : 'Dates come from the photographs unless you set them here.')}</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {select && picked.length > 0 && (
            <select aria-label="Move selected photographs to" value="" onChange={(e) => e.target.value && move(Number(e.target.value))}>
              <option value="">Move to…</option>
              {(all.data ?? []).filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <button className="pill" onClick={() => { setSelect(!select); setPicked([]); setMsg(''); }}>{select ? 'Done' : 'Select photographs'}</button>
        </span>
      </div>
      <div className="just">
        {list.map((p) => {
          const on = picked.includes(p.id);
          const st = { flex: `${p.ar} ${p.ar} ${p.ar * 170}px`, aspectRatio: String(p.ar), opacity: p.archived ? 0.55 : 1, position: 'relative' as const, outline: on ? '2px solid var(--text)' : 'none' };
          return select
            ? <button key={p.id} style={st} aria-pressed={on} aria-label={`${on ? 'Deselect' : 'Select'} ${p.title}`} onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}><Img p={p} /></button>
            : <Link key={p.id} to={`/photo/${p.id}`} style={st} aria-label={p.title}><Img p={p} /></Link>;
        })}
        <i />
      </div>
      {list.length === 0 && <div className="empty">This photoshoot is empty.</div>}
    </div>
  );
}
