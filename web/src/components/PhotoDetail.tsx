import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Idea, Photo } from '../types.js';
import { TagChip } from './TagChip.js';

interface Props {
  photoId: number;
  onClose: () => void;
  onChanged: () => void;
  onAddedToIdea?: (ideaId: number) => void;
}

export function PhotoDetail({ photoId, onClose, onChanged, onAddedToIdea }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [memberIdeas, setMemberIdeas] = useState<{ id: number; title: string; why: string | null }[]>([]);
  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectedIdeaId, setSelectedIdeaId] = useState<number | ''>('');

  async function refresh() {
    const [detail, ideas] = await Promise.all([api.photos.get(photoId), api.ideas.list()]);
    setPhoto(detail.photo);
    setMemberIdeas(detail.ideas);
    setAllIdeas(ideas.ideas);
  }

  useEffect(() => {
    refresh();
  }, [photoId]);

  if (!photo) return null;

  async function addTag() {
    if (!newTag.trim()) return;
    await api.photos.addTag(photo!.id, newTag.trim(), 'user_added');
    setNewTag('');
    await refresh();
    onChanged();
  }

  async function confirmTag(tagId: number) {
    await api.photos.confirmTag(photo!.id, tagId);
    await refresh();
    onChanged();
  }

  async function dismissTag(tagId: number) {
    await api.photos.removeTag(photo!.id, tagId);
    await refresh();
    onChanged();
  }

  async function setNote(tagId: number, note: string) {
    await api.photos.setTagNote(photo!.id, tagId, note);
    await refresh();
  }

  async function addToIdea() {
    if (!selectedIdeaId) return;
    await api.ideas.addPhoto(Number(selectedIdeaId), photo!.id);
    await refresh();
    onAddedToIdea?.(Number(selectedIdeaId));
  }

  return (
    <div className="photo-detail-overlay" onClick={onClose}>
      <div className="photo-detail" onClick={(e) => e.stopPropagation()}>
        <button className="photo-detail__close" onClick={onClose}>×</button>
        <img className="photo-detail__image" src={`/files/display/${photo.id}`} alt={photo.filename} />

        <div className="photo-detail__meta">
          <div>{photo.filename}</div>
          <div className="photo-detail__meta-sub">
            {[photo.camera, photo.film_stock, photo.season].filter(Boolean).join(' · ') || 'No metadata parsed'}
          </div>
        </div>

        <section>
          <h3>Tags</h3>
          <div className="tag-chip-list">
            {photo.tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                onConfirm={tag.source === 'ai_suggested' ? () => confirmTag(tag.id) : undefined}
                onDismiss={() => dismissTag(tag.id)}
                onNoteChange={(note) => setNote(tag.id, note)}
              />
            ))}
          </div>
          <div className="add-tag-row">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="add a tag…"
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
            />
            <button onClick={addTag}>Add</button>
          </div>
        </section>

        <section>
          <h3>In ideas</h3>
          {memberIdeas.length === 0 && <p className="muted">Not in any idea yet.</p>}
          <ul>
            {memberIdeas.map((i) => (
              <li key={i.id}>{i.title}{i.why ? ` — ${i.why}` : ''}</li>
            ))}
          </ul>
          <div className="add-tag-row">
            <select value={selectedIdeaId} onChange={(e) => setSelectedIdeaId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Add to idea…</option>
              {allIdeas.map((idea) => (
                <option key={idea.id} value={idea.id}>{idea.title}</option>
              ))}
            </select>
            <button onClick={addToIdea} disabled={!selectedIdeaId}>Drop in</button>
          </div>
        </section>
      </div>
    </div>
  );
}
