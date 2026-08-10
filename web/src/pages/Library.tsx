import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { api } from '../api.js';
import type { Photo, ShootOptions, Tag } from '../types.js';
import { PhotoDetail } from '../components/PhotoDetail.js';
import { useToast } from '../toast.js';

interface Props {
  onOpenProject: (id: number) => void;
}

const PAGE_SIZE = 60;
const EMPTY_OPTIONS: ShootOptions = { camera: [], lens: [], film_stock: [], location: [], photoshoot: [] };

export function Library({ onOpenProject }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeCamera, setActiveCamera] = useState('');
  const [activeLocation, setActiveLocation] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ShootOptions>(EMPTY_OPTIONS);
  const [projectByPhoto, setProjectByPhoto] = useState<Record<number, string>>({});
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [trashPhotos, setTrashPhotos] = useState<Photo[]>([]);
  const [allIdeas, setAllIdeas] = useState<{ id: number; title: string }[]>([]);
  const [bulkIdeaId, setBulkIdeaId] = useState<number | ''>('');
  const [bulkTag, setBulkTag] = useState('');
  const showToast = useToast();

  const hasFilters = activeTags.length > 0 || !!activeCamera || !!activeLocation || !!search.trim();

  // Multi-tag AND filtering (beyond the first tag) happens client-side on
  // top of an unpaginated, server-filtered result — camera/location/search
  // are all AND'd server-side already. Pagination only applies when nothing
  // is filtered; a filtered set is small enough at personal-library scale
  // to fetch whole.
  async function refresh() {
    const [tagRes] = await Promise.all([api.tags.list()]);
    setTags(tagRes.tags);

    if (hasFilters) {
      const res = await api.photos.list({
        tag: activeTags[0],
        camera: activeCamera || undefined,
        location: activeLocation || undefined,
        q: search.trim() || undefined,
      });
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
  }, [activeTags, activeCamera, activeLocation, search]);

  useEffect(() => {
    api.photos.shootOptions().then(setOptions);
  }, [photos]);

  useEffect(() => {
    api.ideas.list().then(async (res) => {
      setAllIdeas(res.ideas);
      const pairs = await Promise.all(res.ideas.map((idea) => api.ideas.get(idea.id).then((d) => [idea, d.photos] as const)));
      const map: Record<number, string> = {};
      for (const [idea, photos] of pairs) {
        for (const p of photos) map[p.id] = idea.title;
      }
      setProjectByPhoto(map);
    });
  }, []);

  async function refreshTrash() {
    const res = await api.photos.list({ trashed: true });
    setTrashPhotos(res.photos);
  }

  useEffect(() => {
    if (showTrash) refreshTrash();
  }, [showTrash]);

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

  function clearFilters() {
    setActiveTags([]);
    setActiveCamera('');
    setActiveLocation('');
    setSearch('');
  }

  const visible = useMemo(
    () => photos.filter((p) => activeTags.length === 0 || activeTags.every((t) => p.tags.some((pt) => pt.slug === t))),
    [photos, activeTags]
  );
  const visibleIds = useMemo(() => visible.map((p) => p.id), [visible]);
  const canLoadMore = !hasFilters && photos.length < total;

  async function deletePhoto(id: number) {
    if (!confirm('Move this photo to trash? You can restore it later, or delete it forever from Trash.')) return;
    await api.photos.delete(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await refresh();
    showToast('Moved to trash');
  }

  function toggleSelect(id: number, e: MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAddToProject() {
    if (!bulkIdeaId) return;
    const idea = allIdeas.find((i) => i.id === bulkIdeaId);
    for (const id of selectedIds) await api.ideas.addPhoto(bulkIdeaId, id);
    showToast(`Added ${selectedIds.size} photo${selectedIds.size === 1 ? '' : 's'} to "${idea?.title}"`);
    setSelectedIds(new Set());
    setBulkIdeaId('');
    await refresh();
  }

  async function bulkAddTag() {
    const name = bulkTag.trim();
    if (!name) return;
    for (const id of selectedIds) await api.photos.addTag(id, name, 'user_added');
    showToast(`Tagged ${selectedIds.size} photo${selectedIds.size === 1 ? '' : 's'} "${name}"`);
    setSelectedIds(new Set());
    setBulkTag('');
    await refresh();
  }

  async function bulkDelete() {
    if (!confirm(`Move ${selectedIds.size} photo${selectedIds.size === 1 ? '' : 's'} to trash?`)) return;
    for (const id of selectedIds) await api.photos.delete(id);
    showToast(`Moved ${selectedIds.size} photo${selectedIds.size === 1 ? '' : 's'} to trash`);
    setSelectedIds(new Set());
    await refresh();
  }

  async function restorePhoto(id: number) {
    await api.photos.restore(id);
    await refreshTrash();
    await refresh();
    showToast('Restored');
  }

  async function purgePhoto(id: number) {
    if (!confirm('Permanently delete this photo? This cannot be undone.')) return;
    await api.photos.deletePermanently(id);
    await refreshTrash();
    showToast('Permanently deleted');
  }

  if (showTrash) {
    return (
      <div>
        <div className="page-header" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Trash</h1>
            <div className="page-subtitle">{trashPhotos.length} deleted photo{trashPhotos.length === 1 ? '' : 's'} — restore, or delete forever.</div>
          </div>
          <div className="page-header__actions">
            <button className="btn" onClick={() => setShowTrash(false)}>← Back to Library</button>
          </div>
        </div>
        <div className="photo-grid">
          {trashPhotos.map((photo) => (
            <div key={photo.id} className="photo-tile-card">
              <div className="photo-tile-card__img-btn">
                <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
              </div>
              <div className="photo-tile-card__meta">
                <div className="photo-tile-card__filename">{photo.filename}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => restorePhoto(photo.id)}>Restore</button>
                  <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => purgePhoto(photo.id)}>Delete forever</button>
                </div>
              </div>
            </div>
          ))}
          {trashPhotos.length === 0 && <p className="muted">Trash is empty.</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Library</h1>
          <div className="page-subtitle">
            {visible.length} of {total} photos{hasFilters ? ' · filtered' : ''}
          </div>
        </div>
        <div className="page-header__actions">
          <button className="btn" onClick={() => setShowTrash(true)}>Trash</button>
        </div>
      </div>

      <input
        className="field-input search-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search filenames…"
      />

      <div className="chip-bar" style={{ alignItems: 'center' }}>
        {tags.map((t) => (
          <span key={t.id} className={`chip ${activeTags.includes(t.slug) ? 'active' : ''}`} onClick={() => toggleTag(t.slug)}>
            {t.name}
          </span>
        ))}
        <select className="field-input" style={{ width: 'auto' }} value={activeCamera} onChange={(e) => setActiveCamera(e.target.value)}>
          <option value="">Camera: all</option>
          {options.camera.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="field-input" style={{ width: 'auto' }} value={activeLocation} onChange={(e) => setActiveLocation(e.target.value)}>
          <option value="">Location: all</option>
          {options.location.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {hasFilters && <span className="chip-bar__clear" onClick={clearFilters}>Clear filters</span>}
      </div>

      {selectedIds.size > 0 && (
        <div className="suggestion-banner" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="suggestion-banner__text" style={{ fontStyle: 'normal' }}>{selectedIds.size} selected</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={bulkIdeaId} onChange={(e) => setBulkIdeaId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Add to project…</option>
              {allIdeas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
            </select>
            <button className="btn" onClick={bulkAddToProject} disabled={!bulkIdeaId}>Add</button>
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag name…" style={{ width: 120 }} />
            <button className="btn" onClick={bulkAddTag} disabled={!bulkTag.trim()}>Tag</button>
            <button className="btn btn-danger" onClick={bulkDelete}>Delete {selectedIds.size}</button>
            <span className="chip-bar__clear" onClick={() => setSelectedIds(new Set())}>Clear selection</span>
          </div>
        </div>
      )}

      <div className="photo-grid">
        {visible.map((photo) => (
          <div key={photo.id} className="photo-tile-card">
            <button className="photo-tile-card__select" onClick={(e) => toggleSelect(photo.id, e)} title="Select">
              <input type="checkbox" checked={selectedIds.has(photo.id)} readOnly />
            </button>
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
          navIds={visibleIds}
          onNavigate={setOpenPhotoId}
        />
      )}
    </div>
  );
}
