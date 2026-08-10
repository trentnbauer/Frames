import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Photo, Tag } from '../types.js';
import { PhotoDetail } from '../components/PhotoDetail.js';

interface Props {
  onOpenProject: (id: number) => void;
}

const PAGE_SIZE = 60;

export function Library({ onOpenProject }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [projectByPhoto, setProjectByPhoto] = useState<Record<number, string>>({});
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);

  // Multi-tag AND filtering happens client-side on top of the (unpaginated,
  // server-filtered-by-first-tag) result set — pagination only applies to
  // the unfiltered view. At personal-library scale a filtered set is small
  // enough to fetch whole; a "Load more" under an active filter would need
  // the backend to support multi-tag AND queries, which isn't there yet.
  async function refresh() {
    const [tagRes] = await Promise.all([api.tags.list()]);
    setTags(tagRes.tags);

    if (activeTags.length > 0) {
      const res = await api.photos.list({ tag: activeTags[0] });
      setPhotos(res.photos);
      setTotal(res.total);
    } else {
      const res = await api.photos.list({ limit: PAGE_SIZE, offset: 0 });
      setPhotos(res.photos);
      setTotal(res.total);
    }
  }

  useEffect(() => {
    refresh();
  }, [activeTags]);

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

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.photos.list({ limit: PAGE_SIZE, offset: photos.length });
      setPhotos((prev) => [...prev, ...res.photos]);
      setTotal(res.total);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleTag(slug: string) {
    setActiveTags((prev) => (prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]));
  }

  const visible = photos.filter((p) => activeTags.length === 0 || activeTags.every((t) => p.tags.some((pt) => pt.slug === t)));
  const canLoadMore = activeTags.length === 0 && photos.length < total;

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
          {visible.length} of {total} photos{activeTags.length ? ` · filtered by ${activeTags.join(', ')}` : ''}
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

      {canLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button className="btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${total - photos.length} left)`}
          </button>
        </div>
      )}

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
