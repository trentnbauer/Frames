import { useState } from 'react';
import { api, useApi } from '../api';
import type { Shoot } from '../data';
import { Modal } from './Modal';
import ProtoMapPicker from '../proto/ProtoMapPicker';

type Place = { name: string; address: string; kind: string; lat: number; lng: number; precision: string };
type MapHit = { name: string; address: string; kind?: string; suburb?: string; city?: string; lat?: number; lon?: number };
const names = (v: string) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const one = (s: Shoot) => (s.dateFrom && s.dateFrom === s.dateTo ? s.dateFrom.slice(0, 10) : '');

/**
 * Everything about a shoot in one window. What is saved here goes to every photograph in it (place, date and camera details,
 * over what each had), and photographs added to the shoot later take it too. Tags and subjects are only ever added here.
 */
export function EditShoot({ shoot: s, onClose, onSaved }: { shoot: Shoot; onClose: () => void; onSaved: (msg: string) => void }) {
  const gear = useApi<{ cameras: { name: string }[]; lenses: { name: string }[] }>('/gear');
  const [name, setName] = useState(s.name);
  const [date, setDate] = useState(one(s));
  const [place, setPlace] = useState<Place | null>(null); // a newly chosen place, or null for unchanged
  const [clearPlace, setClearPlace] = useState(false);
  const [cam, setCam] = useState({ camera: s.gear?.camera ?? '', lens: s.gear?.lens ?? '', film: s.gear?.film ?? '' });
  const [tags, setTags] = useState('');
  const [subjects, setSubjects] = useState('');
  const [desc, setDesc] = useState(s.description ?? '');
  const [map, setMap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const body: Record<string, unknown> = { overwrite: true };
    if (name.trim() && name.trim() !== s.name) body.name = name.trim();
    if (date && date !== one(s)) body.photoDate = date;
    if (place) { body.place = place.name; body.placeInfo = { address: place.address, kind: place.kind, precision: place.precision, lat: place.lat, lon: place.lng }; }
    else if (clearPlace) body.place = '';
    const g = s.gear ?? { camera: '', lens: '', medium: '', film: '' };
    if (cam.camera.trim() !== g.camera || cam.lens.trim() !== g.lens || cam.film.trim() !== g.film) body.gear = { ...g, camera: cam.camera.trim(), lens: cam.lens.trim(), film: cam.film.trim(), medium: cam.film.trim() ? 'film' : g.medium };
    const addT = names(tags).filter((n) => !s.tags.includes(n)), addS = names(subjects).filter((n) => !s.subjects.includes(n));
    if (addT.length) body.tags = [...s.tags, ...addT];
    if (addS.length) body.subjects = [...s.subjects, ...addS];
    if (desc !== (s.description ?? '')) body.description = desc;
    if (Object.keys(body).length === 1) { onClose(); return; }
    setBusy(true); setErr('');
    try { await api(`/shoots/${s.id}`, { method: 'PATCH', body }); onSaved('Shoot saved · its photographs follow it'); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <label style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text2)', paddingTop: 11 }}>{label}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{control}{hint && <span className="faint" style={{ fontSize: 12 }}>{hint}</span>}</span>
    </label>
  );
  const shownPlace = place ? place.name : clearPlace ? '' : s.place;
  return (
    <>
      <Modal title="Edit shoot" sub="Changes here apply to every photograph in this shoot, and to photographs added to it later." width={620} onClose={onClose}
        foot={<>{err && <span role="alert" className="reason grow">{err}</span>}<span className="grow" /><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {row('Name', <input className="field-in" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Shoot name" />)}
          {row('Date', <input className="field-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Shoot date" />, 'Every photograph takes this date.')}
          {row('Location', <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1, minWidth: 0, color: shownPlace ? 'var(--text)' : 'var(--faint)', fontSize: 14 }}>{shownPlace || 'No location'}</span><button type="button" className="btn outline" onClick={() => setMap(true)}>{shownPlace ? 'Change' : 'Pick on map'}</button>{shownPlace && <button type="button" className="t2" onClick={() => { setPlace(null); setClearPlace(true); }}>Clear</button>}</span>)}
          {row('Camera', <input className="field-in" list="es-cameras" value={cam.camera} onChange={(e) => setCam({ ...cam, camera: e.target.value })} placeholder="Camera body" aria-label="Camera" />)}
          {row('Lens', <input className="field-in" list="es-lenses" value={cam.lens} onChange={(e) => setCam({ ...cam, lens: e.target.value })} placeholder="Lens" aria-label="Lens" />)}
          {row('Film stock', <input className="field-in" value={cam.film} onChange={(e) => setCam({ ...cam, film: e.target.value })} placeholder="Leave blank for digital" aria-label="Film stock" />)}
          {row('Add tags', <input className="field-in" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated" aria-label="Add tags" />, s.tags.length ? `Already: ${s.tags.join(', ')}` : undefined)}
          {row('Add subjects', <input className="field-in" value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Comma-separated" aria-label="Add subjects" />, s.subjects.length ? `Already: ${s.subjects.join(', ')}` : undefined)}
          {row('Description', <textarea className="field-in" rows={3} value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} aria-label="Description" />)}
          <datalist id="es-cameras">{(gear.data?.cameras ?? []).map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <datalist id="es-lenses">{(gear.data?.lenses ?? []).map((c) => <option key={c.name} value={c.name} />)}</datalist>
        </div>
      </Modal>
      {map && (
        <ProtoMapPicker place={null}
          searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)}
          reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (pl: Place) => { setPlace(pl); setClearPlace(false); setMap(false); }}
          onRemovePlace={async () => { setPlace(null); setClearPlace(true); setMap(false); }}
          onClose={() => setMap(false)} />
      )}
    </>
  );
}
