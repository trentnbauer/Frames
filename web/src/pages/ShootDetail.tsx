import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { Header, Img, Loading, useField, useTitle } from '../components/bits';
import { SharePanel } from '../components/SharePanel';
import { useUi } from '../ui';
import { AddToComposition } from '../components/AddToComposition';
import { GearDefaults } from '../components/GearDefaults';
import { MoveToShoot } from '../components/MoveToShoot';

/** The subjects (or tags) a shoot gives to every photograph in it: chips to take away, and a box to add one (existing names are suggested). */
function SharedNames({ kind, names, onChange }: { kind: 'subject' | 'tag'; names: string[]; onChange: (n: string[]) => void }) {
  const known = useApi<{ name: string; n: number }[]>(`/tags?kind=${kind}`);
  const [text, setText] = useState('');
  const id = `known-${kind}`;
  const add = () => { const n = text.trim().toLowerCase(); if (n && !names.includes(n)) onChange([...names, n]); setText(''); };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)', marginRight: 6 }}>{kind === 'subject' ? 'Subjects' : 'Tags'} for every photograph</span>
      {names.map((n) => <span key={n} className="chip">{n} <button aria-label={`Remove ${kind} ${n} from every photograph`} onClick={() => onChange(names.filter((x) => x !== n))}>✕</button></span>)}
      <input list={id} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder={`Add a ${kind}`} aria-label={`Add a ${kind} to every photograph`} style={{ borderRadius: 999, padding: '5px 12px', fontSize: 12.5, width: 150 }} />
      <datalist id={id}>{(known.data ?? []).filter((k) => !names.includes(k.name)).map((k) => <option key={k.name} value={k.name} />)}</datalist>
    </div>
  );
}

export function ShootDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { openNew } = useUi();
  const shoot = useApi<Shoot>(`/shoots/${id}`);
  const all = useApi<Shoot[]>('/shoots');
  const photos = useApi<{ photos: PhotoLite[] }>(`/photos?shoot=${id}&order=oldest`);
  const s0 = shoot.data;
  useTitle(s0?.name ?? 'Photoshoot');
  // Each field follows the server only when its own value changes, so a refresh never wipes text typed in another.
  const [name, setName] = useField(s0?.name ?? '', s0?.id);
  const [place, setPlace] = useField(s0?.place ?? '', s0?.id);
  const [description, setDescription] = useField(s0?.description ?? '', s0?.id);
  const [dateFrom, setDateFrom] = useField(s0?.dateFrom ?? '', s0?.id);
  const [dateTo, setDateTo] = useField(s0?.dateTo ?? '', s0?.id);
  const f = { name, place, description, dateFrom, dateTo };
  const setF = (n: typeof f) => { setName(n.name); setPlace(n.place); setDescription(n.description); setDateFrom(n.dateFrom); setDateTo(n.dateTo); };
  const [select, setSelect] = useState(false);
  const [qs] = useSearchParams();
  const [sharing, setSharing] = useState(qs.get('share') === '1');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 14 }}>
        <Link to="/shoots" style={{ color: 'var(--text2)' }}>← Photoshoots</Link>
        <span style={{ color: 'var(--muted)', display: 'flex', gap: 18 }}>
          {s.source} · imported {new Date(s.importedAt).toLocaleDateString('en-AU')}
          <button style={{ color: 'var(--text2)' }} onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share for review</button>
          <button style={{ color: 'var(--text2)' }} onClick={async () => {
            if (!window.confirm(`Take this photoshoot and all ${photos.data?.photos.length ?? 'its'} photographs out of Frames?\n\nTheir reviews, tags and composition places go with them, and its share links stop working. Files in a library folder are not touched. A scan will not bring them back.`)) return;
            await api(`/shoots/${id}`, { method: 'DELETE' });
            nav('/shoots');
          }}>Delete photoshoot</button>
        </span>
      </div>
      {sharing && <SharePanel kind="shoot" id={s.id} name={s.name} onClose={() => setSharing(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="serif inline" aria-label="Photoshoot name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => f.name.trim() && f.name !== s.name && save({ name: f.name })} style={{ fontSize: 52, lineHeight: 1, marginBottom: 10 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
            <div style={{ width: 140, height: 2, background: 'var(--hair)' }}><i style={{ display: 'block', height: '100%', background: 'var(--text2)', width: `${s.reviewPct}%` }} /></div>
            {s.reviewPct >= 100 ? `All ${s.sessions} sessions done` : `Reviews ${s.reviewPct}% done`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => { setSelect(!select); setPicked([]); setMsg(''); }} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: 'inset 0 0 0 1px var(--outline)' }}>{select ? 'Done selecting' : 'Select photographs'}</button>
          <button onClick={() => openNew({ name: s.name, photoIds: list.map((p) => p.id) })} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '13px 24px', fontSize: 14.5 }}>Compose from this shoot</button>
        </div>
      </div>
      <div className="scard" style={{ padding: '20px 24px', margin: '14px 0 24px', maxWidth: 760 }}>
      <div className="form" style={{ margin: '0 0 14px' }}>
        <label>Place <input className="pin" style={{ width: 200 }} aria-label="Place" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} onBlur={() => f.place !== s.place && save({ place: f.place })} /></label>
        <label>From <input className="pin" style={{ width: 150 }} type="date" aria-label="From date" value={f.dateFrom} onChange={(e) => { setF({ ...f, dateFrom: e.target.value }); save({ dateFrom: e.target.value || null }); }} /></label>
        <label>To <input className="pin" style={{ width: 150 }} type="date" aria-label="To date" value={f.dateTo} onChange={(e) => { setF({ ...f, dateTo: e.target.value }); save({ dateTo: e.target.value || null }); }} /></label>
        <span className="muted">{s.dates} · {s.count} {s.count === 1 ? 'photograph' : 'photographs'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
        <SharedNames kind="subject" names={s.subjects} onChange={(n) => save({ subjects: n })} />
        <SharedNames kind="tag" names={s.tags} onChange={(n) => save({ tags: n })} />
        <p className="muted" style={{ fontSize: 12.5, margin: 0, maxWidth: 640 }}>
          The place, subjects and tags set here are passed down to the photographs in this shoot, and to any moved into it. A place a photograph has of its own stays, and subjects and tags you add to a photograph yourself are never taken away.{' '}
          <button className="t2" style={{ textDecoration: 'underline' }} onClick={async () => { const r = await api<{ photos: number }>(`/shoots/${s.id}/sync`, { body: {} }); setMsg(`Applied to ${r.photos} ${r.photos === 1 ? 'photograph' : 'photographs'}.`); photos.reload(); }}>Apply to every photograph again</button>
        </p>
      </div>
      <details style={{ margin: '0 0 14px', maxWidth: 640 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>Camera defaults for this photoshoot</summary>
        <p className="muted" style={{ fontSize: 12.5 }}>For photographs in this shoot whose file has no camera details (a roll of film, say). They win over your own defaults, and photographs added or moved here follow them. Nothing the file says or you typed is replaced.</p>
        <GearDefaults label="Photoshoot camera defaults" value={s.gear} onSave={(gear) => save({ gear })} />
      </details>
      <textarea className="area" aria-label="Description" rows={2} placeholder="Describe this photoshoot" value={f.description} style={{ maxWidth: 640, width: '100%' }} onChange={(e) => setF({ ...f, description: e.target.value })} onBlur={() => f.description !== s.description && save({ description: f.description })} />
      </div>
      {msg && <div className="muted" role="status" style={{ fontSize: 13, marginBottom: 14 }}>{msg}</div>}
      <div className="just">
        {list.map((p) => {
          const on = picked.includes(p.id);
          const st = { flex: `${p.ar} ${p.ar} ${p.ar * 200}px`, aspectRatio: String(p.ar), opacity: p.archived ? 0.55 : 1, position: 'relative' as const, outline: on ? '2px solid #efede8' : 'none', outlineOffset: -2 };
          const inner = <><Img p={p} />{select && <b className="tick" style={{ background: on ? 'var(--text)' : undefined }}>{on ? '✓' : ''}</b>}</>;
          return select
            ? <button key={p.id} style={st} aria-pressed={on} aria-label={`${on ? 'Deselect' : 'Select'} ${p.title}`} onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}>{inner}</button>
            : <Link key={p.id} to={`/photo/${p.id}`} style={st} aria-label={p.title}>{inner}</Link>;
        })}
        <i />
      </div>
      {list.length === 0 && <div className="empty">This photoshoot is empty.</div>}
      {select && (
        <div className="selbar float" role="region" aria-label="Selected photographs">
          <b style={{ fontWeight: 500 }}>{picked.length} selected</b>
          <button style={{ color: 'var(--text2)' }} onClick={() => setPicked([])}>Clear</button>
          <MoveToShoot up ids={picked} except={s.id} onDone={(m) => { setMsg(m); setPicked([]); setSelect(false); shoot.reload(); photos.reload(); all.reload(); }} />
          <AddToComposition up label="Add to a composition…" ids={picked} onDone={(m) => { setMsg(m); setPicked([]); }} />
          <button disabled={picked.length === 0} onClick={() => openNew({ name: s.name, photoIds: picked })} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14, opacity: picked.length ? 1 : 0.5 }}>New composition from {picked.length}</button>
        </div>
      )}
    </div>
  );
}
