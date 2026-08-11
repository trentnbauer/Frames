import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { api } from '../api.js';
import type { Photo, ShootOptions, Tag } from '../types.js';
import { PhotoDetail } from '../components/PhotoDetail.js';
import { ColorDot } from '../components/ColorDot.js';
import { COLOR_TAG_NAMES } from '../colorNames.js';
import { pickFromDropbox, pickFromGoogleDrive } from '../importSources.js';
import { useToast } from '../toast.js';

interface Props {
  onOpenProject: (id: number) => void;
  forProjectId: number | null;
}

const PAGE_SIZE = 60;
const EMPTY_OPTIONS: ShootOptions = { camera: [], lens: [], film_stock: [], location: [], photoshoot: [] };

export function Library({ onOpenProject, forProjectId }: Props) {
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
  const [importBatch, setImportBatch] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newTagValues, setNewTagValues] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function refreshProjectMap() {
    const res = await api.ideas.list();
    setAllIdeas(res.ideas);
    const pairs = await Promise.all(res.ideas.map((idea) => api.ideas.get(idea.id).then((d) => [idea, d.photos] as const)));
    const map: Record<number, string> = {};
    for (const [idea, photos] of pairs) {
      for (const p of photos) map[p.id] = idea.title;
    }
    setProjectByPhoto(map);
  }

  useEffect(() => {
    refreshProjectMap();
  }, []);

  const forProject = forProjectId != null ? allIdeas.find((i) => i.id === forProjectId) ?? null : null;

  async function refreshTrash() {
    const res = await api.photos.list({ trashed: true });
    setTrashPhotos(res.photos);
  }

  useEffect(() => {
    if (showTrash) refreshTrash();
  }, [showTrash]);

  // Poll rows still auto-tagging so suggested tags appear without a manual refresh.
  useEffect(() => {
    const pendingIds = importBatch.filter((p) => p.tagging_status === 'pending').map((p) => p.id);
    if (pendingIds.length === 0) return;
    const timer = setInterval(async () => {
      const updated = await Promise.all(pendingIds.map((id) => api.photos.get(id).then((r) => r.photo)));
      setImportBatch((prev) => prev.map((p) => updated.find((u) => u.id === p.id) ?? p));
    }, 2500);
    return () => clearInterval(timer);
  }, [importBatch]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.photos.upload(Array.from(files));
      setImportBatch((prev) => [...prev, ...res.results.map((r) => r.photo)]);
      const dupes = res.results.filter((r) => r.wasDuplicate).length;

      if (forProjectId != null) {
        for (const r of res.results) await api.ideas.addPhoto(forProjectId, r.photo.id);
        showToast(
          `Imported ${res.results.length} photo${res.results.length === 1 ? '' : 's'} and added to "${forProject?.title ?? 'project'}"` +
            (dupes ? ` (${dupes} already in Library)` : '')
        );
        await refreshProjectMap();
      } else {
        showToast(
          `Imported ${res.results.length} photo${res.results.length === 1 ? '' : 's'}` +
            (dupes ? ` (${dupes} already in Library)` : '')
        );
      }

      await refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function importFrom(source: 'google' | 'dropbox') {
    try {
      const files = source === 'google' ? await pickFromGoogleDrive() : await pickFromDropbox();
      await handleFiles(files);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function refreshImportRow(id: number) {
    const { photo } = await api.photos.get(id);
    setImportBatch((prev) => prev.map((p) => (p.id === id ? photo : p)));
  }

  async function removeImportTag(photo: Photo, tagId: number) {
    await api.photos.removeTag(photo.id, tagId);
    await refreshImportRow(photo.id);
  }

  async function addImportTag(photo: Photo) {
    const value = (newTagValues[photo.id] ?? '').trim();
    if (!value) return;
    await api.photos.addTag(photo.id, value, 'user_added');
    setNewTagValues((prev) => ({ ...prev, [photo.id]: '' }));
    await refreshImportRow(photo.id);
    await refresh();
  }

  async function updateImportField(photo: Photo, field: 'camera' | 'lens' | 'film_stock' | 'location' | 'photoshoot', value: string) {
    if (value === (photo[field] ?? '')) return;
    await api.photos.update(photo.id, { [field]: value });
    await refreshImportRow(photo.id);
    await refresh();
  }

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
      {forProject && (
        <div className="suggestion-banner" style={{ marginBottom: 16 }}>
          <div className="suggestion-banner__text" style={{ fontStyle: 'normal' }}>
            Photos you import now are added straight to <strong>{forProject.title}</strong>.
          </div>
          <button className="btn btn-accent" onClick={() => onOpenProject(forProject.id)}>Done — back to project</button>
        </div>
      )}

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Library</h1>
          <div className="page-subtitle">
            {visible.length} of {total} photos{hasFilters ? ' · filtered' : ''}
          </div>
        </div>
        <div className="page-header__actions">
          <button className="btn" onClick={() => importFrom('google')}>Import from Google Drive</button>
          <button className="btn" onClick={() => importFrom('dropbox')}>Import from Dropbox</button>
          <button className="btn" onClick={() => setShowTrash(true)}>Trash</button>
        </div>
      </div>

      <datalist id="tag-options-list">{tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
      <datalist id="camera-options-list">{options.camera.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="lens-options-list">{options.lens.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="film-options-list">{options.film_stock.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="location-options-list">{options.location.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="photoshoot-options-list">{options.photoshoot.map((o) => <option key={o} value={o} />)}</datalist>

      {importBatch.length > 0 && (
        <>
          <div className="import-status-row">
            <div className="import-status-row__label">{importBatch.length} photo{importBatch.length === 1 ? '' : 's'} to review</div>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>Add More</button>
          </div>

          <div className="import-list">
            {importBatch.map((photo) => (
              <div key={photo.id} className="import-row">
                <img className="import-row__thumb" src={`/files/thumb/${photo.id}`} alt={photo.filename} />
                <div className="import-row__body">
                  <div className="import-row__filename">
                    {photo.filename}{photo.tagging_status === 'pending' ? ' · tagging…' : ''}
                  </div>

                  <div className="import-row__label">Suggested tags — click to remove</div>
                  <div className="import-row__tags">
                    {photo.tags.map((t) => (
                      <span key={t.id} className="import-tag-pill active" onClick={() => removeImportTag(photo, t.id)}>
                        {t.name} ✕
                      </span>
                    ))}
                    <input
                      className="import-tag-input"
                      value={newTagValues[photo.id] ?? ''}
                      onChange={(e) => setNewTagValues((prev) => ({ ...prev, [photo.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addImportTag(photo)}
                      list="tag-options-list"
                      placeholder="+ add tag"
                    />
                  </div>

                  <div className="import-row__label">Shoot details — optional</div>
                  <input
                    className="field-input import-row__photoshoot"
                    defaultValue={photo.photoshoot ?? ''}
                    onBlur={(e) => updateImportField(photo, 'photoshoot', e.target.value)}
                    list="photoshoot-options-list"
                    placeholder="Photoshoot, e.g. Portrait of Ebony"
                  />
                  <div className="import-row__fields-grid">
                    <input className="field-input" defaultValue={photo.camera ?? ''} onBlur={(e) => updateImportField(photo, 'camera', e.target.value)} list="camera-options-list" placeholder="Camera model" />
                    <input className="field-input" defaultValue={photo.lens ?? ''} onBlur={(e) => updateImportField(photo, 'lens', e.target.value)} list="lens-options-list" placeholder="Lens" />
                    <input className="field-input" defaultValue={photo.film_stock ?? ''} onBlur={(e) => updateImportField(photo, 'film_stock', e.target.value)} list="film-options-list" placeholder="Film stock" />
                    <input className="field-input" defaultValue={photo.location ?? ''} onBlur={(e) => updateImportField(photo, 'location', e.target.value)} list="location-options-list" placeholder="Location" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        className={`dropzone-lg ${importBatch.length > 0 ? 'has-batch' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <div className="dropzone-lg__icon"><div className="dropzone-lg__icon-arrow" /></div>
        <div className="dropzone-lg__title">
          {uploading ? 'Uploading…' : importBatch.length > 0 ? 'Import more photos' : 'Drop photos to import'}
        </div>
        <div className="dropzone-lg__hint">Drag and drop, or click to choose files from your desktop</div>
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
            {COLOR_TAG_NAMES.has(t.slug) && <ColorDot name={t.slug} />}
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
            <PaletteBar palette={photo.palette} />
            <div className="photo-tile-card__meta">
              <div className="photo-tile-card__filename">{photo.filename}</div>
              <div className="photo-tile-card__tags">
                {photo.tags.slice(0, 3).map((t) => (
                  <span key={t.id} className="tag-pill-soft">
                    {t.note === 'dominant color' && <ColorDot name={t.name} />}
                    {t.name}
                  </span>
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

// A Lomography-style color-bar strip: equal-width swatches of the photo's
// dominant colors, most-prominent first. Renders nothing for photos that
// predate this feature (palette null) rather than an empty/broken bar.
function PaletteBar({ palette }: { palette: string[] | null }) {
  if (!palette || palette.length === 0) return null;
  return (
    <div className="palette-bar">
      {palette.map((color, i) => (
        <span key={i} className="palette-bar__swatch" style={{ background: color }} />
      ))}
    </div>
  );
}
