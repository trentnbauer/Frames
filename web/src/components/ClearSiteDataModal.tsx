import { useState } from 'react';
import { Modal } from './Modal';
import { clearSiteData } from '../clearSiteData';

export function ClearSiteDataModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clear = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await clearSiteData(); window.location.reload(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <Modal title="Clear site data?" sub="Clears cached files and saved site preferences in this browser. You may need to sign in again. Your photos, reviews and server settings stay saved." onClose={() => !busy && onClose()}
    foot={<><span className="grow" /><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void clear()}>{busy ? 'Clearing…' : 'Clear and reload'}</button></>}>
    {error && <p className="reason" role="alert">{error}</p>}
  </Modal>;
}
