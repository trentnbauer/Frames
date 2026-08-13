import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { api } from '../api.js';
import type { NearDuplicateGroup, Photo, ShootOptions, Tag } from '../types.js';
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
  const [activeFavorite, setActiveFavorite] = useState(false);
  const [sort, setSort] = useState<'created_at' | 'taken_at'>('created_at');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ShootOptions>(EMPTY_OPTIONS);
  const [projectByPhoto, setProjectByPhoto] = useState<Record<number, string>>({});
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [trashPhotos, setTrashPhotos] = useState<Photo[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<NearDuplicateGroup[][]>([]);
  const [allIdeas, setAllIdeas] = useState<{ id: number; title: string }[]>([]);
  const [bulkIdeaId, setBulkIdeaId] = useState<number | ''>('');
  const [bulkTag, setBulkTag] = useState('');
  const [showBulkFields, setShowBulkFields] = useState(false);
  const [bulkCamera, setBulkCamera] = useState('');
  const [bulkLens, setBulkLens] = useState('');
  const [bulkFilmStock, setBulkFilmStock] = useState('');
  const [bulkLocation, setBulkLocation] = useState('');
  const [importBatch, setImportBatch] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingPreviews, setUploadingPreviews] = useState<{ url: string; name: string }[]>([]);
  const [newTagValues, setNewTagValues] = useState<Record<number, string>>({});
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [isDraggingOverPage, setIsDraggingOverPage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const showToast = useToast();

  // "/" focuses search from anywhere on the page, like Library's own
  // dedicated shortcut cheat-sheet entry — ignored while already typing
  // somewhere else so it doesn't hijack a "/" typed into another field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const active = document.activeElement;
      const isEditable = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const hasFilters = activeTags.length > 0 || !!activeCamera || !!activeLocation || !!search.trim() || activeFavorite;

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
        favorite: activeFavorite || undefined,
        sort,
      });
      setPhotos(res.photos);
      setTotal(res.total);
    } else {
      const res = await api.photos.list({ limit: PAGE_SIZE, offset: 0, sort });
      setPhotos(res.photos);
      setTotal(res.total);
    }
  }

  useEffect(() => {
    refresh();
  }, [activeTags, activeCamera, activeLocation, activeFavorite, search, sort]);

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
    const fileArray = Array.from(files);
    // Instant local previews (object URLs, not yet-uploaded thumbnails) so
    // the grid of spinning blocks appears immediately on selection rather
    // than waiting on the single batched upload response, which only
    // resolves once every file in the batch has finished.
    const previews = fileArray.map((f) => ({ url: URL.createObjectURL(f), name: f.name }));
    setUploadingPreviews(previews);
    setUploading(true);
    try {
      const res = await api.photos.upload(fileArray);
      const succeeded = res.results.filter((r) => r.ok);
      const failed = res.results.filter((r) => !r.ok);
      setImportBatch((prev) => [...prev, ...succeeded.map((r) => r.photo)]);
      const dupes = succeeded.filter((r) => r.wasDuplicate).length;

      if (forProjectId != null) {
        for (const r of succeeded) await api.ideas.addPhoto(forProjectId, r.photo.id);
        showToast(
          `Imported ${succeeded.length} photo${succeeded.length === 1 ? '' : 's'} and added to "${forProject?.title ?? 'project'}"` +
            (dupes ? ` (${dupes} already in Library)` : '') +
            (failed.length ? ` — ${failed.length} failed (not an image?)` : '')
        );
        await refreshProjectMap();
      } else {
        showToast(
          `Imported ${succeeded.length} photo${succeeded.length === 1 ? '' : 's'}` +
            (dupes ? ` (${dupes} already in Library)` : '') +
            (failed.length ? ` — ${failed.length} failed (not an image?)` : '')
        );
      }

      await refresh();
    } finally {
      setUploading(false);
      setUploadingPreviews([]);
      for (const p of previews) URL.revokeObjectURL(p.url);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Drag-and-drop works from anywhere on the page, not just the (now
  // removed) dedicated dropzone — a window-level counter tracks nested
  // dragenter/dragleave pairs fired as the pointer crosses child elements,
  // since a naive show-on-enter/hide-on-leave flickers on every boundary.
  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounter.current += 1;
      setIsDraggingOverPage(true);
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setIsDraggingOverPage(false);
    }
    function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingOverPage(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [forProjectId, forProject]);

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
      const res = await api.photos.list({ limit: PAGE_SIZE, offset: photos.length, sort });
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
    setActiveFavorite(false);
    setSearch('');
  }

  async function toggleFavorite(photoId: number, e: MouseEvent) {
    e.stopPropagation();
    await api.photos.favorite(photoId);
    await refresh();
  }

  async function refreshDuplicates() {
    const res = await api.discovery.nearDuplicates();
    setDuplicateGroups(res.groups);
  }

  // Fetched once on mount (not lazily on opening the Duplicates view) so the
  // header's "Duplicates N" count is accurate before the user ever opens it.
  useEffect(() => {
    refreshDuplicates();
  }, []);

  async function trashFromDuplicates(id: number) {
    if (!confirm('Move this photo to trash? You can restore it later, or delete it forever from Trash.')) return;
    await api.photos.delete(id);
    await refreshDuplicates();
    showToast('Moved to trash');
  }

  // "Best" here just means highest pixel count — a proxy for "the original
  // full-res scan" vs. a smaller re-export/re-share of the same frame, not
  // actual sharpness/quality judgment (that'd need real image analysis).
  async function keepLargestInGroup(group: NearDuplicateGroup[]) {
    const sorted = [...group].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
    const [keep, ...rest] = sorted;
    if (!confirm(`Keep "${keep.filename}" (largest) and move the other ${rest.length} to trash?`)) return;
    for (const p of rest) await api.photos.delete(p.id);
    await refreshDuplicates();
    showToast(`Kept "${keep.filename}", trashed ${rest.length}`);
  }

  const visible = useMemo(
    () => photos.filter((p) => activeTags.length === 0 || activeTags.every((t) => p.tags.some((pt) => pt.slug === t))),
    [photos, activeTags]
  );
  const visibleIds = useMemo(() => visible.map((p) => p.id), [visible]);
  const canLoadMore = !hasFilters && photos.length < total;

  // "visible" is already ordered by the server (taken_at DESC when
  // sort==='taken_at') — grouping here just buckets consecutive same-month
  // photos under a shared header rather than re-sorting anything.
  const timelineGroups = useMemo(() => {
    const groups: [string, Photo[]][] = [];
    for (const photo of visible) {
      const label = photo.taken_at
        ? new Date(photo.taken_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : 'Undated';
      const last = groups[groups.length - 1];
      if (last && last[0] === label) last[1].push(photo);
      else groups.push([label, [photo]]);
    }
    return groups;
  }, [visible]);

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

  // Only fields the user actually typed something into get applied — an
  // empty bulk field means "leave this alone", not "clear it", since a
  // camera/lens/location bulk-set is meant for a batch that shares those
  // details (a whole scanned roll), not a blanket wipe of unrelated ones.
  async function bulkSetFields() {
    const updates: Record<string, string> = {};
    if (bulkCamera.trim()) updates.camera = bulkCamera.trim();
    if (bulkLens.trim()) updates.lens = bulkLens.trim();
    if (bulkFilmStock.trim()) updates.film_stock = bulkFilmStock.trim();
    if (bulkLocation.trim()) updates.location = bulkLocation.trim();
    if (Object.keys(updates).length === 0) return;

    for (const id of selectedIds) await api.photos.update(id, updates);
    showToast(`Updated shoot details on ${selectedIds.size} photo${selectedIds.size === 1 ? '' : 's'}`);
    setSelectedIds(new Set());
    setBulkCamera('');
    setBulkLens('');
    setBulkFilmStock('');
    setBulkLocation('');
    setShowBulkFields(false);
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

  if (showDuplicates) {
    const allIds = duplicateGroups.flatMap((g) => g.map((p) => p.id));
    return (
      <div>
        <div className="page-header" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Possible Duplicates</h1>
            <div className="page-subtitle">
              {duplicateGroups.length} group{duplicateGroups.length === 1 ? '' : 's'} of near-identical photos
            </div>
          </div>
          <div className="page-header__actions">
            <button className="btn" onClick={() => setShowDuplicates(false)}>← Back to Library</button>
          </div>
        </div>
        {duplicateGroups.map((group, i) => (
          <div key={i} className="duplicate-group">
            <div className="duplicate-group__label muted">
              Group {i + 1} · {group.length} photos
              <button className="btn" style={{ marginLeft: 12, padding: '3px 10px', fontSize: 12 }} onClick={() => keepLargestInGroup(group)}>
                Keep largest, trash rest
              </button>
            </div>
            <div className="photo-grid">
              {group.map((p) => (
                <div key={p.id} className="photo-tile-card">
                  <button className="photo-tile-card__img-btn" onClick={() => setOpenPhotoId(p.id)}>
                    <img src={`/files/thumb/${p.id}`} alt={p.filename} loading="lazy" />
                  </button>
                  <div className="photo-tile-card__meta">
                    <div className="photo-tile-card__filename">{p.filename}</div>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: 12, marginTop: 6 }}
                      onClick={() => trashFromDuplicates(p.id)}
                    >
                      Trash this one
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {duplicateGroups.length === 0 && <p className="muted">No likely duplicates found.</p>}
        {openPhotoId !== null && (
          <PhotoDetail
            photoId={openPhotoId}
            onClose={() => setOpenPhotoId(null)}
            onChanged={refreshDuplicates}
            navIds={allIds}
            onNavigate={setOpenPhotoId}
          />
        )}
      </div>
    );
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

  // Own class set (not the shared .photo-tile-card* also used by
  // ProjectDetail's reorderable grid) — this grid keeps each photo's native
  // aspect ratio instead of a fixed cropped height, so the two can't share
  // sizing rules.
  function renderTile(photo: Photo) {
    return (
      <div key={photo.id} className="library-tile">
        <div className="library-tile__frame">
          <button className="library-tile__img-btn" onClick={() => setOpenPhotoId(photo.id)}>
            <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
          </button>
          <div className="library-tile__scrim" />
          <button className="library-tile__select" onClick={(e) => toggleSelect(photo.id, e)} title="Select">
            <input type="checkbox" checked={selectedIds.has(photo.id)} readOnly />
          </button>
          <button
            className={`library-tile__favorite ${photo.is_favorite ? 'is-active' : ''}`}
            onClick={(e) => toggleFavorite(photo.id, e)}
            title={photo.is_favorite ? 'Remove favorite' : 'Mark as favorite'}
          >
            ★
          </button>
          <button className="library-tile__delete" onClick={() => deletePhoto(photo.id)} title="Delete photo">✕</button>
          <div className="library-tile__overlay-meta">
            {projectByPhoto[photo.id] && <span className="library-tile__badge">{projectByPhoto[photo.id]}</span>}
            <div className="library-tile__filename">{photo.filename}</div>
            <div className="library-tile__tags">
              {photo.tags.slice(0, 3).map((t) => (
                <span key={t.id} className="library-tile__tag">
                  {t.note === 'auto:dominant-color' && <ColorDot name={t.name} />}
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <PaletteBar palette={photo.palette} />
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
          <button className="btn" onClick={() => setShowDuplicates(true)}>
            Duplicates {duplicateGroups.length > 0 && <span className="btn__count">{duplicateGroups.length}</span>}
          </button>
          <button className="btn" onClick={() => setShowTrash(true)}>Trash</button>
          <div className="import-menu">
            <button className="btn btn-accent" onClick={() => setShowImportMenu((v) => !v)}>Import ▾</button>
            {showImportMenu && (
              <>
                <div className="import-menu__backdrop" onClick={() => setShowImportMenu(false)} />
                <div className="import-menu__dropdown">
                  <button onClick={() => { setShowImportMenu(false); fileInputRef.current?.click(); }}>From files…</button>
                  <button onClick={() => { setShowImportMenu(false); importFrom('google'); }}>From Google Drive</button>
                  <button onClick={() => { setShowImportMenu(false); importFrom('dropbox'); }}>From Dropbox</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />

      {isDraggingOverPage && (
        <div className="page-drop-overlay">
          <div className="page-drop-overlay__icon"><div className="dropzone-lg__icon-arrow" /></div>
          <div className="page-drop-overlay__title">Drop to import{forProject ? ` into "${forProject.title}"` : ''}</div>
        </div>
      )}

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

      {uploading && (
        <div className="import-status-row">
          <div className="import-status-row__label">Uploading {uploadingPreviews.length} photo{uploadingPreviews.length === 1 ? '' : 's'}…</div>
        </div>
      )}

      {uploadingPreviews.length > 0 && (
        <div className="upload-preview-grid">
          {uploadingPreviews.map((p, i) => (
            <div key={i} className="upload-tile">
              {/* p.url is a blob: URL from URL.createObjectURL() on the
                  locally-selected File object, never server/network data,
                  and React sets it as a plain `src` attribute (not
                  innerHTML) — no HTML is parsed from this value. CodeQL's
                  js/xss-through-dom alert on this line is a false positive
                  (dismissed on GitHub, not suppressed inline — an inline
                  `codeql[...]` comment here was tried first but wasn't
                  actually honored by a fresh scan). */}
              <img src={p.url} alt={p.name} />
              <div className="upload-tile__spinner" />
              <div className="upload-tile__name">{p.name}</div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={searchInputRef}
        className="field-input search-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search filename, camera, lens, location… (/ to focus)"
      />

      <div className="chip-bar chip-bar--sticky" style={{ alignItems: 'center' }}>
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
        <select className="field-input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as 'created_at' | 'taken_at')}>
          <option value="created_at">Sort: Newest imported</option>
          <option value="taken_at">Sort: Date taken</option>
        </select>
        <span className={`chip ${activeFavorite ? 'active' : ''}`} onClick={() => setActiveFavorite((v) => !v)}>★ Favorites</span>
        {hasFilters && <span className="chip-bar__clear" onClick={clearFilters}>Clear filters</span>}
      </div>

      {sort === 'taken_at' && timelineGroups.length > 0 ? (
        timelineGroups.map(([label, groupPhotos]) => (
          <div key={label} className="timeline-group">
            <div className="timeline-group__label">{label}</div>
            <div className="photo-grid">{groupPhotos.map(renderTile)}</div>
          </div>
        ))
      ) : (
        <div className="photo-grid">
          {visible.map(renderTile)}
          {visible.length === 0 && <p className="muted">No photos match. Upload some scans to get started.</p>}
        </div>
      )}

      {canLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button className="btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${total - photos.length} left)`}
          </button>
        </div>
      )}

      {/* Sticky-bottom, not inline before the grid — a bar that pushed the
          grid down on appearing (and scrolled out of view with it) meant
          selection and actions were rarely on screen together. */}
      {selectedIds.size > 0 && (
        <div className="selection-dock">
          <div className="selection-dock__count">{selectedIds.size} selected</div>
          <div className="selection-dock__actions">
            <select value={bulkIdeaId} onChange={(e) => setBulkIdeaId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Add to project…</option>
              {allIdeas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
            </select>
            <button className="btn" onClick={bulkAddToProject} disabled={!bulkIdeaId}>Add</button>
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag name…" style={{ width: 120 }} />
            <button className="btn" onClick={bulkAddTag} disabled={!bulkTag.trim()}>Tag</button>
            <button className="btn" onClick={() => setShowBulkFields((v) => !v)}>{showBulkFields ? 'Hide details' : 'Set details…'}</button>
            <button className="btn btn-danger" onClick={bulkDelete}>Delete {selectedIds.size}</button>
            <span className="chip-bar__clear" onClick={() => setSelectedIds(new Set())}>Clear selection</span>
          </div>
          {showBulkFields && (
            <div className="selection-dock__fields">
              <input className="field-input" value={bulkCamera} onChange={(e) => setBulkCamera(e.target.value)} list="camera-options-list" placeholder="Camera model" style={{ width: 160 }} />
              <input className="field-input" value={bulkLens} onChange={(e) => setBulkLens(e.target.value)} list="lens-options-list" placeholder="Lens" style={{ width: 160 }} />
              <input className="field-input" value={bulkFilmStock} onChange={(e) => setBulkFilmStock(e.target.value)} list="film-options-list" placeholder="Film stock" style={{ width: 160 }} />
              <input className="field-input" value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)} list="location-options-list" placeholder="Location" style={{ width: 160 }} />
              <button
                className="btn btn-accent"
                onClick={bulkSetFields}
                disabled={![bulkCamera, bulkLens, bulkFilmStock, bulkLocation].some((v) => v.trim())}
              >
                Apply to {selectedIds.size}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>Blank fields are left unchanged</span>
            </div>
          )}
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
export function PaletteBar({ palette }: { palette: string[] | null }) {
  if (!palette || palette.length === 0) return null;
  return (
    <div className="palette-bar">
      {palette.map((color, i) => (
        <span key={i} className="palette-bar__swatch" style={{ background: color }} />
      ))}
    </div>
  );
}
