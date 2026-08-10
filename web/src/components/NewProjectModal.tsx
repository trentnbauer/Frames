import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Idea, LightPref } from '../types.js';
import { LIGHT_PREFS } from '../types.js';

interface Props {
  open: boolean;
  initialTitle?: string;
  onClose: () => void;
  onCreated: (idea: Idea) => void;
}

export function NewProjectModal({ open, initialTitle, onClose, onCreated }: Props) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [notes, setNotes] = useState('');
  const [lightPref, setLightPref] = useState<LightPref>('any');

  useEffect(() => {
    if (open) setTitle(initialTitle ?? '');
  }, [open, initialTitle]);

  if (!open) return null;

  async function create() {
    if (!title.trim()) return;
    const { idea } = await api.ideas.create({ title: title.trim(), notes: notes.trim() || undefined, light_pref: lightPref });
    setTitle('');
    setNotes('');
    setLightPref('any');
    onCreated(idea);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__title">New idea</div>
        <p className="muted" style={{ margin: '-4px 0 0' }}>Becomes a project once you drop photos into it.</p>

        <div className="modal-field">
          <label>Name</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pigeons of Melbourne"
            autoFocus
          />
        </div>

        <div className="modal-field">
          <label>Description</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What ties this set together?"
          />
        </div>

        <div className="modal-field">
          <label>Ideal light</label>
          <div className="chip-bar" style={{ marginBottom: 0, paddingBottom: 0, border: 'none' }}>
            {LIGHT_PREFS.map((lp) => (
              <span key={lp} className={`chip ${lightPref === lp ? 'active' : ''}`} onClick={() => setLightPref(lp)}>
                {lp.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={`btn ${title.trim() ? 'btn-solid' : ''}`} disabled={!title.trim()} onClick={create}>
            Create idea
          </button>
        </div>
      </div>
    </div>
  );
}
