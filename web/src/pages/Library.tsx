import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Photo, Tag } from '../types.js';
import { PhotoDetail } from '../components/PhotoDetail.js';

interface Props {
  onOpenProject: (id: number) => void;
}

export function Library({ onOpenProject }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [projectByPhoto, setProjectByPhoto] = useState<Record<number, string>>({});
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);

  async function refresh() {
    const [photoRes, tagRes] = await Promise.all([api.photos.list(), api.tags.list()]);
    setPhotos(photoRes.photos);
    setTags(tagRes.tags);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    api.ideas.list().then(async (res) => {
      const pairs = await Promise.all(res.ideas.map((idea) => api.ideas.get(idea.id).then((d) => [idea, d.photos] as const)));
      const map: Record<number, string> = {};
      for (const [idea, photos] of pairs) {
        for (const p of photos) map[p.id] = idea.title;
      }
      setProjectByPhoto(map);
    });
  }, []);

  function toggleTag(slug: string) {
    setActiveTags((prev) => (prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]));
  }

  const visible = photos.filter((p) => activeTags.length === 0 || activeTags.every((t) => p.tags.some((pt) => pt.slug === t)));

  async function deletePhoto(id: number) {
    if (!confirm('Delete this photo? This removes the original and cannot be undone.')) return;
    await api.photos.delete(id);
    await refresh();
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Library</h1>
        <div className="page-subtitle">
          {visible.length} of {photos.length} photos{activeTags.length ? ` · filtered by ${activeTags.join(', ')}` : ''}
        </div>
      </div>

      <div className="chip-bar">
        {tags.map((t) => (
          <span key={t.id} className={`chip ${activeTags.includes(t.slug) ? 'active' : ''}`} onClick={() => toggleTag(t.slug)}>
            {t.name}
          </span>
        ))}
        {activeTags.length > 0 && (
          <span className="chip-bar__clear" onClick={() => setActiveTags([])}>Clear filters</span>
        )}
      </div>

      <div className="photo-grid">
        {visible.map((photo) => (
          <div key={photo.id} className="photo-tile-card">
            <button className="photo-tile-card__img-btn" onClick={() => setOpenPhotoId(photo.id)}>
              <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
            </button>
            {projectByPhoto[photo.id] && <span className="photo-tile-card__badge">{projectByPhoto[photo.id]}</span>}
            <button className="photo-tile-card__delete" onClick={() => deletePhoto(photo.id)} title="Delete photo">✕</button>
            <div className="photo-tile-card__meta">
              <div className="photo-tile-card__filename">{photo.filename}</div>
              <div className="photo-tile-card__tags">
                {photo.tags.slice(0, 3).map((t) => (
                  <span key={t.id} className="tag-pill-soft">{t.name}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="muted">No photos match. Upload some scans to get started.</p>}
      </div>

      {openPhotoId !== null && (
        <PhotoDetail
          photoId={openPhotoId}
          onClose={() => setOpenPhotoId(null)}
          onChanged={refresh}
          onAddedToIdea={onOpenProject}
        />
      )}
    </div>
  );
}
