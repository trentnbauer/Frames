import { useState } from 'react';
import { api } from '../api';
import type { Shoot } from '../data';
import { Modal } from './Modal';

export function ShootDate({ shoot, onSaved }: { shoot: Shoot; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await api(`/shoots/${shoot.id}`, { method: 'PATCH', body: { photoDate: date } }); onSaved(); setOpen(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    <button type="button" title="Change photoshoot date" onClick={() => { setDate((shoot.dateFrom ?? shoot.importedAt).slice(0, 10)); setError(''); setOpen(true); }} style={{ color: 'inherit', font: 'inherit' }}>{shoot.dates} ✎</button>
    {open && <Modal title="Change photoshoot date" sub={`Apply this date to all ${shoot.count} photographs in this shoot. Original file and camera dates are preserved.`} onClose={() => !busy && setOpen(false)} foot={<><span className="grow" /><button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!date || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Apply to all photos'}</button></>}>
      <label className="field">Photoshoot date<input type="date" aria-label="Photoshoot date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {error && <p role="alert" className="reason">{error}</p>}
    </Modal>}
  </>;
}
