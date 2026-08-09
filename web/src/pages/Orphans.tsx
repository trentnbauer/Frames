import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Photo } from '../types.js';
import { PhotoCard } from '../components/PhotoCard.js';
import { PhotoDetail } from '../components/PhotoDetail.js';

export function Orphans() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);

  async function refresh() {
    const res = await api.discovery.orphans();
    setPhotos(res.photos);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="orphans-page">
      <p className="muted">Frames with no tags and no idea — nothing good should get lost here.</p>
      <div className="photo-grid">
        {photos.map((p) => (
          <PhotoCard key={p.id} photo={p} onClick={() => setOpenPhotoId(p.id)} />
        ))}
        {photos.length === 0 && <p className="muted">None — everything's at least tagged or claimed.</p>}
      </div>
      {openPhotoId !== null && (
        <PhotoDetail photoId={openPhotoId} onClose={() => setOpenPhotoId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
