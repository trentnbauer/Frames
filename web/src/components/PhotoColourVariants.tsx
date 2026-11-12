import { useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '../api';
import type { PhotoFull, PhotoLite } from '../data';
import { Modal } from './Modal';

export function PhotoColourVariants({ photo, photos }: { photo: PhotoFull; photos: PhotoLite[] }) {
  const [open, setOpen] = useState(false);
  const root = photo.parentId ?? photo.id;
  const variants = photos.filter((p) => p.id !== photo.id && (p.id === root || p.parentId === root));
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderTop: '1px solid var(--hair)', fontSize: 13.5, width: '100%' }}>
      <span>Colour & variants</span><span className="faint">{variants.length} {variants.length === 1 ? 'variant' : 'variants'} ›</span>
    </button>
    {open && <Modal title="Colour & variants" onClose={() => setOpen(false)}>
      <div className="eyebrow">Colour palette</div>
      {photo.palette.length ? <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{photo.palette.map((c) => <div key={c.hex} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ background: c.hex, width: 32, height: 32, borderRadius: 6 }} /><span>{c.name} · {Math.round(c.pct)}%</span></div>)}</div> : <p className="muted">No colour palette is available yet.</p>}
      <div className="eyebrow">Linked variants</div>
      {variants.length ? variants.map((p) => <Link key={p.id} to={`/photo/${p.id}`} onClick={() => setOpen(false)} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img src={imgUrl(p.id, 'thumb')} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} /><span>{p.title || p.file}</span></Link>) : <p className="muted">No linked variants of this photograph.</p>}
    </Modal>}
  </>;
}
