import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Photo, Tag } from '../types.js';
import { PhotoCard } from '../components/PhotoCard.js';
import { PhotoDetail } from '../components/PhotoDetail.js';
import { UploadDropzone } from '../components/UploadDropzone.js';

interface Props {
  onAddedToIdea: (ideaId: number) => void;
}

export function PhotoGrid({ onAddedToIdea }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);

  async function refresh() {
    const [photoRes, tagRes] = await Promise.all([
      api.photos.list(activeTag ? { tag: activeTag } : undefined),
      api.tags.list(),
    ]);
    setPhotos(photoRes.photos);
    setTags(tagRes.tags);
  }

  useEffect(() => {
    refresh();
  }, [activeTag]);

  return (
    <div className="photo-grid-page">
      <UploadDropzone onUploaded={refresh} />

      <div className="tag-filter-bar">
        <button className={activeTag === null ? 'active' : ''} onClick={() => setActiveTag(null)}>
          All ({photos.length})
        </button>
        {tags.map((t) => (
          <button key={t.id} className={activeTag === t.slug ? 'active' : ''} onClick={() => setActiveTag(t.slug)}>
            {t.name} ({t.photo_count})
          </button>
        ))}
      </div>

      <div className="photo-grid">
        {photos.map((p) => (
          <PhotoCard key={p.id} photo={p} onClick={() => setOpenPhotoId(p.id)} />
        ))}
        {photos.length === 0 && <p className="muted">No photos yet. Upload some scans to get started.</p>}
      </div>

      {openPhotoId !== null && (
        <PhotoDetail
          photoId={openPhotoId}
          onClose={() => setOpenPhotoId(null)}
          onChanged={refresh}
          onAddedToIdea={onAddedToIdea}
        />
      )}
    </div>
  );
}
