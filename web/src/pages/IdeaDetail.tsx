import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Idea, IdeaPhoto, LightPref, Photo, Tag } from '../types.js';
import { LIGHT_PREFS } from '../types.js';

interface Props {
  ideaId: number;
  onBack: () => void;
}

export function IdeaDetail({ ideaId, onBack }: Props) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [candidateTag, setCandidateTag] = useState<string>('');
  const [candidates, setCandidates] = useState<Photo[]>([]);

  async function refresh() {
    const [detail, tagRes] = await Promise.all([api.ideas.get(ideaId), api.tags.list()]);
    setIdea(detail.idea);
    setPhotos(detail.photos);
    setTags(tagRes.tags);
  }

  useEffect(() => {
    refresh();
  }, [ideaId]);

  useEffect(() => {
    if (!candidateTag) {
      setCandidates([]);
      return;
    }
    api.photos.list({ tag: candidateTag }).then((res) => {
      const memberIds = new Set(photos.map((p) => p.id));
      setCandidates(res.photos.filter((p) => !memberIds.has(p.id)));
    });
  }, [candidateTag, photos]);

  if (!idea) return null;

  async function updateField(field: 'title' | 'notes' | 'light_pref' | 'status', value: string) {
    await api.ideas.update(ideaId, { [field]: value });
    await refresh();
  }

  async function removePhoto(photoId: number) {
    await api.ideas.removePhoto(ideaId, photoId);
    await refresh();
  }

  async function setWhy(photoId: number, why: string) {
    await api.ideas.setWhy(ideaId, photoId, why);
    await refresh();
  }

  async function addCandidate(photoId: number) {
    await api.ideas.addPhoto(ideaId, photoId);
    await refresh();
  }

  async function deleteIdea() {
    if (!confirm(`Delete idea "${idea?.title}"? This does not delete the photos.`)) return;
    await api.ideas.delete(ideaId);
    onBack();
  }

  return (
    <div className="idea-detail">
      <button className="back-link" onClick={onBack}>← All ideas</button>

      <div className="idea-detail__fields">
        <input
          className="idea-detail__title"
          defaultValue={idea.title}
          onBlur={(e) => e.target.value !== idea.title && updateField('title', e.target.value)}
        />
        <div className="idea-detail__row">
          <select defaultValue={idea.light_pref} onChange={(e) => updateField('light_pref', e.target.value as LightPref)}>
            {LIGHT_PREFS.map((lp) => (
              <option key={lp} value={lp}>{lp}</option>
            ))}
          </select>
          <select defaultValue={idea.status} onChange={(e) => updateField('status', e.target.value)}>
            <option value="active">active</option>
            <option value="done">done</option>
            <option value="archived">archived</option>
          </select>
          <a className="button-link" href={api.ideas.exportUrl(ideaId)}>Export zip</a>
          <button className="danger" onClick={deleteIdea}>Delete idea</button>
        </div>
        <textarea
          placeholder="Notes — the rule, the subject, the framing constraint…"
          defaultValue={idea.notes ?? ''}
          onBlur={(e) => e.target.value !== (idea.notes ?? '') && updateField('notes', e.target.value)}
        />
      </div>

      <h3>Photos in this idea ({photos.length})</h3>
      <div className="idea-photo-list">
        {photos.map((p) => (
          <div key={p.id} className="idea-photo-row">
            <img src={`/files/thumb/${p.id}`} alt={p.filename} />
            <input
              className="why-input"
              placeholder="why this frame belongs…"
              defaultValue={p.why ?? ''}
              onBlur={(e) => e.target.value !== (p.why ?? '') && setWhy(p.id, e.target.value)}
            />
            <button className="danger" onClick={() => removePhoto(p.id)}>Remove</button>
          </div>
        ))}
        {photos.length === 0 && <p className="muted">Nothing dropped in yet.</p>}
      </div>

      <h3>Add photos by tag</h3>
      <select value={candidateTag} onChange={(e) => setCandidateTag(e.target.value)}>
        <option value="">Pick a tag…</option>
        {tags.map((t) => (
          <option key={t.id} value={t.slug}>{t.name} ({t.photo_count})</option>
        ))}
      </select>
      <div className="candidate-grid">
        {candidates.map((c) => (
          <button key={c.id} className="candidate-card" onClick={() => addCandidate(c.id)}>
            <img src={`/files/thumb/${c.id}`} alt={c.filename} />
            <span>+ add</span>
          </button>
        ))}
      </div>
    </div>
  );
}
