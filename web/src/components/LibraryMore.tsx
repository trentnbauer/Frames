import { keyClick } from './keyClick';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { confirmAction } from './dialogs';
import { BulkJobs } from './BulkJobs';
import { Modal } from './Modal';

type View = { id: number; name: string; filters: string };
type Job = { id: string; status: string };

/** The Library toolbar's ⋯ menu: saved filters, then Recently removed, Review schedule and Batch jobs. */
export function LibraryMore() {
  const views = useApi<View[]>('/views');
  const jobs = useApi<Job[]>('/photos/bulk-jobs');
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = views.data?.find((v) => v.id === selectedId);
  const pending = jobs.data?.filter((j) => j.status === 'pending').length ?? 0;
  const close = () => setOpen(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); views.reload(); setModal(null); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const item = (label: string, onClick: () => void, meta?: string, on?: boolean) => (
    <button key={label} className="mi" role="menuitem" onClick={onClick}><span>{on ? '✓ ' : ''}{label}</span>{meta && <span className="meta">{meta}</span>}</button>
  );
  return (
    <span style={{ position: 'relative' }}>
      <button className="iconbtn" title="More" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) { views.reload(); jobs.reload(); } setOpen(!open); }}
        style={{ width: 40, height: 40, borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 18 }}>⋯</button>
      {open && (
        <>
          <div role="button" tabIndex={0} onKeyDown={keyClick} className="pop-scrim" onClick={close} />
          <div className="popover" role="menu" aria-label="More Library actions" style={{ right: 0, top: 'calc(100% + 6px)' }}>
            <div className="eyebrow" style={{ padding: '8px 10px 4px' }}>Saved filters</div>
            {(views.data ?? []).map((v) => item(v.name, () => { setSelectedId(v.id); setSp(v.filters ?? '', { replace: true }); close(); }, undefined, v.id === selectedId))}
            {item('Save current filters…', () => { close(); setName(''); setError(''); setModal('new'); })}
            {selected && item(`Update “${selected.name}” with current filters`, () => { close(); void run(() => api(`/views/${selected.id}`, { method: 'PATCH', body: { filters: sp.toString() } })); })}
            {selected && item(`Rename “${selected.name}”…`, () => { close(); setName(selected.name); setError(''); setModal('rename'); })}
            {selected && item(`Delete “${selected.name}”…`, async () => {
              close();
              if (await confirmAction(`Delete saved filters ${selected.name}?`)) void run(async () => { await api(`/views/${selected.id}`, { method: 'DELETE' }); setSelectedId(null); });
            })}
            <div className="msep" />
            {item('Recently removed', () => { close(); nav('/activity'); })}
            {item('Review schedule', () => { close(); nav('/review-schedule'); })}
            {item('Batch jobs', () => { close(); setJobsOpen(true); }, pending ? `${pending} running` : '')}
          </div>
        </>
      )}
      {jobsOpen && <BulkJobs open onClose={() => { setJobsOpen(false); jobs.reload(); }} />}
      {modal && (
        <Modal
          title={modal === 'rename' ? 'Rename saved filters' : 'Save current filters'}
          sub="New matching photographs join these filters automatically."
          onClose={() => !busy && setModal(null)}
          foot={<>
            <button className="btn" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            <button className="btn primary" disabled={busy || !name.trim()} onClick={() => void run(async () => {
              if (modal === 'rename' && selected) await api(`/views/${selected.id}`, { method: 'PATCH', body: { name } });
              else { const result = await api<View>('/views', { body: { name, filters: sp.toString() } }); setSelectedId(result.id); }
            })}>Save</button>
          </>}
        >
          <label>Name<input className="field-in" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </span>
  );
}
