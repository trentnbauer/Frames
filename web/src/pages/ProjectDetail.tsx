import { useEffect, useState, type DragEvent } from 'react';
import { api } from '../api.js';
import type { Idea, IdeaPhoto, LightPref, Photo } from '../types.js';
import { LIGHT_PREFS } from '../types.js';
import { relativeTime } from '../relativeTime.js';
import { PhotoDetail } from '../components/PhotoDetail.js';

interface Props {
  projectId: number;
  onBack: () => void;
  onImport: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}

export function ProjectDetail({ projectId, onBack, onImport, onDeleted, onChanged }: Props) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [suggested, setSuggested] = useState<Photo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const [dragOverGrid, setDragOverGrid] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function refresh() {
    try {
      const [detail, sug] = await Promise.all([api.ideas.get(projectId), api.ideas.suggestedPhotos(projectId)]);
      setIdea(detail.idea);
      setPhotos(detail.photos);
      setSuggested(sug.photos.slice(0, 4));
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    setNotFound(false);
    refresh();
  }, [projectId]);

  if (notFound) {
    return (
      <div>
        <button className="back-link" onClick={onBack}>← All projects</button>
        <p className="muted">This project doesn't exist — maybe it was deleted.</p>
      </div>
    );
  }

  if (!idea) return null;

  const tags = Array.from(new Set(photos.flatMap((p) => p.tags.map((t) => t.name))));
  const visible = photos.filter((p) => activeTags.length === 0 || activeTags.every((t) => p.tags.some((pt) => pt.name === t)));

  async function updateField(field: 'title' | 'notes' | 'light_pref' | 'status', value: string) {
    await api.ideas.update(projectId, { [field]: value });
    await refresh();
    onChanged();
  }

  function toggleTag(name: string) {
    setActiveTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  async function markFinished() {
    await updateField('status', 'done');
  }

  async function addPhotoById(photoId: number) {
    await api.ideas.addPhoto(projectId, photoId);
    await refresh();
    onChanged();
  }

  async function addSuggested() {
    for (const p of suggested) {
      await api.ideas.addPhoto(projectId, p.id);
    }
    await refresh();
    onChanged();
  }

  function handleDragStart(e: DragEvent, photoId: number) {
    e.dataTransfer.setData('text/x-frames-photo-id', String(photoId));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleGridDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes('text/x-frames-photo-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverGrid(true);
  }

  function handleGridDrop(e: DragEvent) {
    e.preventDefault();
    setDragOverGrid(false);
    const raw = e.dataTransfer.getData('text/x-frames-photo-id');
    const photoId = Number(raw);
    if (raw && !Number.isNaN(photoId)) addPhotoById(photoId);
  }

  async function deleteProject() {
    if (!confirm(`Delete project "${idea?.title}"? This does not delete the photos.`)) return;
    await api.ideas.delete(projectId);
    onDeleted();
  }

  const isFinished = idea.status === 'done';

  return (
    <div>
      <button className="back-link" onClick={onBack}>← All projects</button>

      <div className="project-header">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <input
              className="editable-title"
              style={{ marginBottom: 0 }}
              defaultValue={idea.title}
              onBlur={(e) => e.target.value !== idea.title && updateField('title', e.target.value)}
            />
            {photos.length === 0 && <span className="idea-badge">IDEA</span>}
          </div>
          <textarea
            className="editable-desc"
            defaultValue={idea.notes ?? ''}
            placeholder="What ties this set together?"
            onBlur={(e) => e.target.value !== (idea.notes ?? '') && updateField('notes', e.target.value)}
          />
          <div className="project-header__meta">
            {photos.length} photo{photos.length === 1 ? '' : 's'} · created {relativeTime(idea.created_at)}
          </div>
        </div>

        <div className="project-header__actions">
          <select className="light-pref-select" value={idea.light_pref} onChange={(e) => updateField('light_pref', e.target.value as LightPref)}>
            {LIGHT_PREFS.map((lp) => <option key={lp} value={lp}>{lp.replace('_', ' ')}</option>)}
          </select>
          {isFinished && <a className="btn btn-accent" href={api.ideas.exportUrl(projectId)}>Download Photos</a>}
          {isFinished && <span className="finished-badge">✓ Finished</span>}
          {!isFinished && <button className="btn" onClick={markFinished}>Mark as Finished</button>}
          {suggested.length > 0 && (
            <button className="btn" onClick={addSuggested}>+ Add {suggested.length} Suggested Photo{suggested.length === 1 ? '' : 's'}</button>
          )}
          <button className="btn btn-accent" onClick={onImport}>Add Photos</button>
          <button className="btn btn-danger" onClick={deleteProject}>Delete</button>
        </div>
      </div>

      {suggested.length > 0 && (
        <div className="suggested-strip">
          <div className="suggested-strip__title muted">Photos elsewhere that might belong here — drag one in, or click to view</div>
          <div className="suggested-strip__grid">
            {suggested.map((p) => (
              <button
                key={p.id}
                className="suggested-strip__tile"
                draggable
                onDragStart={(e) => handleDragStart(e, p.id)}
                onClick={() => setOpenPhotoId(p.id)}
                title="Drag into the grid below to add"
              >
                <img src={`/files/thumb/${p.id}`} alt={p.filename} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="chip-bar">
          {tags.map((t) => (
            <span key={t} className={`chip ${activeTags.includes(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>{t}</span>
          ))}
          {activeTags.length > 0 && <span className="chip-bar__clear" onClick={() => setActiveTags([])}>Clear filters</span>}
        </div>
      )}

      <div
        className={`photo-grid photo-grid--dropzone ${dragOverGrid ? 'is-drag-over' : ''}`}
        onDragOver={handleGridDragOver}
        onDragLeave={() => setDragOverGrid(false)}
        onDrop={handleGridDrop}
      >
        {visible.map((photo) => (
          <div key={photo.id} className="photo-tile-card">
            <button className="photo-tile-card__img-btn" onClick={() => setOpenPhotoId(photo.id)}>
              <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
            </button>
            <div className="photo-tile-card__meta">
              <div className="photo-tile-card__filename">{photo.filename}</div>
              <div className="photo-tile-card__tags">
                {photo.tags.slice(0, 3).map((t) => <span key={t.id} className="tag-pill-soft">{t.name}</span>)}
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="muted">{suggested.length > 0 ? 'Nothing dropped in yet — drag a suggestion down here.' : 'Nothing dropped in yet.'}</p>
        )}
      </div>

      {openPhotoId !== null && (
        <PhotoDetail
          photoId={openPhotoId}
          onClose={() => setOpenPhotoId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
