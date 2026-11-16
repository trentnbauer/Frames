import { Modal } from './Modal';

export type RemoveOption = { label: string; hint: string; on: boolean; pick: () => void };

/**
 * The one dialog for taking photographs out of Frames (Library, Photo page and Review). "Remove from Frames" keeps the original files;
 * only the option that moves the file to the trash is called delete.
 */
export function RemovePhotosModal({ title, sub, warn, thumbs, options, confirmLabel, onConfirm, onClose }: {
  title: string; sub?: string; warn?: string; thumbs: string[]; options: RemoveOption[]; confirmLabel: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} sub={sub} width={480} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={onConfirm}>{confirmLabel}</button></>}>
      {thumbs.length > 0 && <div style={{ display: 'flex', gap: 2 }}>{thumbs.slice(0, 3).map((t, i) => <i key={i} style={{ width: 30, height: 40, borderRadius: 2, background: `url(${t}) center/cover` }} />)}</div>}
      {warn && <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{warn}</p>}
      <div role="radiogroup" aria-label="What to remove" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {options.map((o) => (
          <button key={o.label} role="radio" aria-checked={o.on} onClick={o.pick} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: o.on ? 'var(--hover)' : 'transparent', boxShadow: o.on ? 'inset 0 0 0 1px var(--outline)' : 'none' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', flex: 'none', marginTop: 2, boxShadow: o.on ? 'inset 0 0 0 5px var(--text)' : 'inset 0 0 0 1.5px var(--outline)' }} />
            <span><span style={{ display: 'block', fontSize: 14 }}>{o.label}</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{o.hint}</span></span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
