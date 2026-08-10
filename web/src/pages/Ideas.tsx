import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Idea, LightPref } from '../types.js';
import { LIGHT_PREFS } from '../types.js';

interface Props {
  onOpenIdea: (id: number) => void;
}

export function Ideas({ onOpenIdea }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [title, setTitle] = useState('');
  const [lightPref, setLightPref] = useState<LightPref>('any');

  async function refresh() {
    const res = await api.ideas.list();
    setIdeas(res.ideas);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createIdea() {
    if (!title.trim()) return;
    const { idea } = await api.ideas.create({ title: title.trim(), light_pref: lightPref });
    setTitle('');
    setLightPref('any');
    await refresh();
    onOpenIdea(idea.id);
  }

  return (
    <div className="ideas-page">
      <h2>Ideas</h2>
      <div className="idea-create-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New idea title…"
          onKeyDown={(e) => e.key === 'Enter' && createIdea()}
        />
        <select value={lightPref} onChange={(e) => setLightPref(e.target.value as LightPref)}>
          {LIGHT_PREFS.map((lp) => (
            <option key={lp} value={lp}>{lp}</option>
          ))}
        </select>
        <button onClick={createIdea}>Create</button>
      </div>

      <div className="idea-list">
        {ideas.map((idea) => (
          <button key={idea.id} className="idea-card" onClick={() => onOpenIdea(idea.id)}>
            <div className="idea-card__title">{idea.title}</div>
            <div className="idea-card__meta">
              {idea.light_pref} · {idea.status} · {idea.photo_count ?? 0} photo{idea.photo_count === 1 ? '' : 's'}
            </div>
          </button>
        ))}
        {ideas.length === 0 && <p className="muted">No ideas yet. Start one from a tag you keep noticing.</p>}
      </div>
    </div>
  );
}
