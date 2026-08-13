import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api } from '../api.js';
import type { Idea, IdeaPhoto, IdeaReference, LightPref, Photo, ShotListItem } from '../types.js';
import { LIGHT_PREFS } from '../types.js';
import { relativeTime } from '../relativeTime.js';
import { PhotoDetail } from '../components/PhotoDetail.js';
import { ColorDot } from '../components/ColorDot.js';
import { useToast } from '../toast.js';

interface Props {
  projectId: number;
  onBack: () => void;
  onImport: () => void;
  onOpenZine: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}

export function ProjectDetail({ projectId, onBack, onImport, onOpenZine, onDeleted, onChanged }: Props) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [suggested, setSuggested] = useState<Photo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const [dragOverGrid, setDragOverGrid] = useState(false);
  const [dragOverPhotoId, setDragOverPhotoId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const showToast = useToast();

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
    showToast('Marked as finished');
  }

  async function reopenProject() {
    await updateField('status', 'active');
    showToast('Reopened — back in progress');
  }

  async function addPhotoById(photoId: number) {
    await api.ideas.addPhoto(projectId, photoId);
    await refresh();
    onChanged();
    showToast('Added to project');
  }

  async function addSuggested() {
    const count = suggested.length;
    for (const p of suggested) {
      await api.ideas.addPhoto(projectId, p.id);
    }
    await refresh();
    onChanged();
    showToast(`Added ${count} suggested photo${count === 1 ? '' : 's'}`);
  }

  function handleDragStart(e: DragEvent, photoId: number) {
    e.dataTransfer.setData('text/x-frames-photo-id', String(photoId));
    e.dataTransfer.effectAllowed = 'copyMove';
    setDraggingId(photoId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverPhotoId(null);
    setDragOverGrid(false);
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

  async function reorderPhoto(draggedId: number, targetId: number) {
    const from = photos.findIndex((p) => p.id === draggedId);
    const to = photos.findIndex((p) => p.id === targetId);
    if (from === -1 || to === -1 || from === to) return;

    const reordered = [...photos];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setPhotos(reordered);

    try {
      await api.ideas.reorder(projectId, reordered.map((p) => p.id));
    } catch {
      showToast('Could not save the new order');
      await refresh();
    }
  }

  function handleTileDragOver(e: DragEvent, photoId: number) {
    if (!e.dataTransfer.types.includes('text/x-frames-photo-id')) return;
    e.preventDefault();
    e.stopPropagation();
    // dataTransfer.getData() isn't readable during dragover (only at drop) in
    // most browsers, so use the id captured at dragstart to tell "reordering
    // an existing member" from "dragging in a new suggested photo" for the
    // cursor icon — checking the target tile's id here was always true (it's
    // always a member, since it's rendered from `photos`) and showed "move"
    // even when adding a brand-new photo.
    e.dataTransfer.dropEffect = draggingId !== null && photos.some((p) => p.id === draggingId) ? 'move' : 'copy';
    setDragOverPhotoId(photoId);
  }

  function handleTileDrop(e: DragEvent, targetPhotoId: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPhotoId(null);
    setDragOverGrid(false);
    const raw = e.dataTransfer.getData('text/x-frames-photo-id');
    const draggedId = Number(raw);
    if (!raw || Number.isNaN(draggedId) || draggedId === targetPhotoId) return;

    if (photos.some((p) => p.id === draggedId)) {
      reorderPhoto(draggedId, targetPhotoId);
    } else {
      addPhotoById(draggedId);
    }
  }

  async function deleteProject() {
    if (!confirm(`Delete project "${idea?.title}"? This does not delete the photos.`)) return;
    const title = idea?.title;
    await api.ideas.delete(projectId);
    onDeleted();
    showToast(`Deleted "${title}"`);
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
              title={idea.title}
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
          <a className="btn" href={api.ideas.briefUrl(projectId)} target="_blank" rel="noopener noreferrer">
            Contact Sheet / Brief
          </a>
          {photos.length > 0 && (
            <button className="btn" onClick={onOpenZine}>Zine</button>
          )}
          {isFinished && <a className="btn btn-accent" href={api.ideas.exportUrl(projectId)}>Download Photos</a>}
          {isFinished && <span className="finished-badge">✓ Finished</span>}
          {isFinished && <button className="btn" onClick={reopenProject}>Reopen</button>}
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
                onDragEnd={handleDragEnd}
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

      <MoodBoard projectId={projectId} />
      <ShotList projectId={projectId} />

      <div
        className={`photo-grid photo-grid--dropzone ${dragOverGrid ? 'is-drag-over' : ''}`}
        onDragOver={handleGridDragOver}
        onDragLeave={() => setDragOverGrid(false)}
        onDrop={handleGridDrop}
      >
        {visible.map((photo) => (
          <div
            key={photo.id}
            className={`photo-tile-card ${dragOverPhotoId === photo.id ? 'is-drop-target' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, photo.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleTileDragOver(e, photo.id)}
            onDragLeave={() => setDragOverPhotoId((id) => (id === photo.id ? null : id))}
            onDrop={(e) => handleTileDrop(e, photo.id)}
          >
            <button className="photo-tile-card__img-btn" onClick={() => setOpenPhotoId(photo.id)}>
              <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
            </button>
            <div className="photo-tile-card__meta">
              <div className="photo-tile-card__filename">{photo.filename}</div>
              <div className="photo-tile-card__tags">
                {photo.tags.slice(0, 3).map((t) => (
                  <span key={t.id} className="tag-pill-soft">
                    {t.note === 'auto:dominant-color' && <ColorDot name={t.name} />}
                    {t.name}
                  </span>
                ))}
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
          navIds={visible.map((p) => p.id)}
          onNavigate={setOpenPhotoId}
        />
      )}
    </div>
  );
}

// "Frames I still need for this project" — distinct from idea_photos, which
// tracks frames already shot and dropped in below.
function ShotList({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ShotListItem[]>([]);
  const [newText, setNewText] = useState('');

  async function refresh() {
    setItems((await api.ideas.shotList.list(projectId)).items);
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function addItem() {
    const text = newText.trim();
    if (!text) return;
    setNewText('');
    await api.ideas.shotList.add(projectId, text);
    await refresh();
  }

  async function toggleDone(item: ShotListItem) {
    await api.ideas.shotList.update(projectId, item.id, { done: !item.done });
    await refresh();
  }

  async function editText(item: ShotListItem, text: string) {
    if (!text.trim() || text.trim() === item.text) return;
    await api.ideas.shotList.update(projectId, item.id, { text: text.trim() });
    await refresh();
  }

  async function remove(item: ShotListItem) {
    await api.ideas.shotList.remove(projectId, item.id);
    await refresh();
  }

  if (items.length === 0 && newText === '') {
    return (
      <details style={{ marginBottom: 8 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>+ Shot list — what you still need to go shoot</summary>
        <div className="add-tag-row">
          <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="e.g. wide shot at golden hour" onKeyDown={(e) => e.key === 'Enter' && addItem()} />
          <button onClick={addItem}>Add</button>
        </div>
      </details>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <h3 style={{ marginBottom: 6 }}>Shot list</h3>
      <div className="shot-list">
        {items.map((item) => (
          <div key={item.id} className={`shot-list__item ${item.done ? 'is-done' : ''}`}>
            <input type="checkbox" checked={!!item.done} onChange={() => toggleDone(item)} />
            <input
              className="shot-list__text"
              defaultValue={item.text}
              onBlur={(e) => editText(item, e.target.value)}
            />
            <button className="danger" onClick={() => remove(item)}>✕</button>
          </div>
        ))}
      </div>
      <div className="add-tag-row">
        <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="e.g. wide shot at golden hour" onKeyDown={(e) => e.key === 'Enter' && addItem()} />
        <button onClick={addItem}>Add</button>
      </div>
    </div>
  );
}

// Mood board: reference images/notes pinned before there are real shots —
// inspiration, not the idea's actual photo grid below.
function MoodBoard({ projectId }: { projectId: number }) {
  const [references, setReferences] = useState<IdeaReference[]>([]);
  const [noteText, setNoteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  async function refresh() {
    setReferences((await api.ideas.references.list(projectId)).references);
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) await api.ideas.references.addImage(projectId, file);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    setNoteText('');
    await api.ideas.references.addNote(projectId, text);
    await refresh();
  }

  async function remove(ref: IdeaReference) {
    await api.ideas.references.remove(projectId, ref.id);
    await refresh();
  }

  if (references.length === 0) {
    return (
      <details style={{ marginBottom: 8 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>+ Mood board — inspiration images and notes</summary>
        <div className="add-tag-row" style={{ marginTop: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Add image'}</button>
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="pin a note…" onKeyDown={(e) => e.key === 'Enter' && addNote()} />
          <button onClick={addNote}>Add note</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
      </details>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <h3 style={{ marginBottom: 6 }}>Mood board</h3>
      <div className="moodboard-strip">
        {references.map((ref) => (
          <div key={ref.id} className="moodboard-tile">
            <button className="moodboard-tile__remove" onClick={() => remove(ref)} title="Remove">✕</button>
            {ref.kind === 'image' ? (
              <img src={`/files/reference/${ref.id}`} alt="Reference" />
            ) : (
              <div className="moodboard-tile__note">{ref.text}</div>
            )}
          </div>
        ))}
      </div>
      <div className="add-tag-row">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Add image'}</button>
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="pin a note…" onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <button onClick={addNote}>Add note</button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
    </div>
  );
}
