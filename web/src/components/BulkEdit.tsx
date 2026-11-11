import { useState } from 'react';
import { api } from '../api';
import ProtoMapPicker from '../proto/ProtoMapPicker';
import { AddChip } from './AddChip';
import { GearPicker } from './GearPicker';
import { Modal } from './Modal';

type Place = { name: string; address: string; kind: string; lat: number; lng: number; precision: string; suburb: string; city: string };
type MapHit = { name: string; address: string };

const label = { font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--faint)' };
const chip = { height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 6px 0 12px', borderRadius: 999, background: 'color-mix(in srgb, var(--text) 12%, transparent)', fontSize: 13 };

/** A row of names with a cross on each and "+ Add" at the end. */
function Names({ list, set, what }: { list: string[]; set: (v: string[]) => void; what: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {list.map((n) => <span key={n} style={chip}>{n}<span role="button" tabIndex={0} aria-label={`Remove ${n}`} onClick={() => set(list.filter((x) => x !== n))} style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--text2)' }}>✕</span></span>)}
      <AddChip label={what} onAdd={(n) => { if (!list.some((x) => x.toLowerCase() === n.toLowerCase())) set([...list, n]); }} />
    </div>
  );
}

/**
 * Edit several photographs at once (Library, with a selection): tags and subjects to add, a camera and lens, and a place from the map.
 * Tags are added to what each photograph has; a camera, lens or place replaces what it has. Nothing is sent until Apply.
 */
export function BulkEdit({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [camera, setCamera] = useState('');
  const [lens, setLens] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [map, setMap] = useState(false);
  const [done, setDone] = useState(0);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');
  const nothing = !subjects.length && !tags.length && !camera && !lens && !place;

  const apply = async () => {
    setWorking(true); setErr(''); setDone(0);
    const patch: Record<string, unknown> = {};
    if (camera) patch.camera = camera;
    if (lens) patch.lens = lens;
    if (place) Object.assign(patch, { place: place.name, placeAddress: place.address, placeKind: place.kind, placePrecision: place.precision, lat: place.lat, lon: place.lng });
    const ops = [...subjects.map((name) => ({ name, kind: 'subject' })), ...tags.map((name) => ({ name, kind: 'tag' }))];
    let failed = 0, next = 0;
    const one = async (id: number) => {
      if (Object.keys(patch).length) await api(`/photos/${id}`, { method: 'PATCH', body: patch });
      for (const o of ops) await api(`/photos/${id}/tags`, { method: 'PUT', body: { ...o, action: 'accept' } });
    };
    // A few at a time, so a long selection does not wait on one request after another.
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try { await one(id); } catch { failed++; }
        setDone((d) => d + 1);
      }
    }));
    setWorking(false);
    if (failed) { setErr(`${failed} of ${ids.length} photos could not be changed. The rest were.`); onDone(); return; }
    onDone(); onClose();
  };

  return (
    <>
      <Modal title={`Edit ${ids.length} ${ids.length === 1 ? 'photo' : 'photos'}`} sub="Fill in only what you want to change. Nothing is sent until you press Apply." width={620} onClose={working ? () => undefined : onClose}
        foot={<><span className="grow" style={{ fontSize: 12.5 }}>{err ? <span className="reason" style={{ margin: 0 }}>{err}</span> : working ? `Applying… ${done} of ${ids.length}` : ''}</span><button className="btn" onClick={onClose} disabled={working}>{err ? 'Close' : 'Cancel'}</button><button className="btn primary" onClick={() => void apply()} disabled={nothing || working}>{`Apply to ${ids.length} ${ids.length === 1 ? 'photo' : 'photos'}`}</button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span style={label}>Subjects to add</span><Names list={subjects} set={setSubjects} what="subject" /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span style={label}>Tags to add</span><Names list={tags} set={setTags} what="tag" /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={label}>Camera · replaces what each photo has</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <GearPicker kind="camera" value={camera} onCommit={setCamera} placeholder="Camera body" title="Search your gear, or add a camera" className="field-in" style={{ height: 40, width: 260, padding: '0 14px' }} />
              <GearPicker kind="lens" value={lens} onCommit={setLens} placeholder="Lens" title="Search your gear, or add a lens" className="field-in" style={{ height: 40, width: 260, padding: '0 14px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={label}>Location · replaces what each photo has</span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span role="button" tabIndex={0} onClick={() => setMap(true)} title="Search the map, or click it to drop a pin" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13.5, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {place ? place.name : 'Pick on the map'}
              </span>
              {place && <span role="button" tabIndex={0} onClick={() => setPlace(null)} style={{ fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>Clear</span>}
            </span>
          </div>
        </div>
      </Modal>
      {map && (
        <ProtoMapPicker place={place} searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)} reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (pl: Place) => { setPlace(pl); }} onRemovePlace={async () => setPlace(null)} onClose={() => setMap(false)} />
      )}
    </>
  );
}
