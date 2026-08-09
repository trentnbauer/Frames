import { useEffect, useState } from 'react';
import { api } from '../api.js';

interface Gap {
  id: number;
  slug: string;
  name: string;
  unclaimed_count: number;
}

interface Props {
  onStartIdea: (ideaId: number) => void;
}

export function GapFinder({ onStartIdea }: Props) {
  const [gaps, setGaps] = useState<Gap[]>([]);

  useEffect(() => {
    api.discovery.gapFinder().then((res) => setGaps(res.gaps));
  }, []);

  async function startIdeaFromTag(gap: Gap) {
    const { idea } = await api.ideas.create({ title: gap.name, notes: `Started from the "${gap.name}" gap.` });
    const photos = await api.photos.list({ tag: gap.slug });
    for (const p of photos.photos) {
      await api.ideas.addPhoto(idea.id, p.id);
    }
    onStartIdea(idea.id);
  }

  return (
    <div className="gap-finder">
      <p className="muted">
        Tags with frames that aren't in any idea yet — the projects hiding in your archive.
      </p>
      <div className="gap-list">
        {gaps.map((g) => (
          <div key={g.id} className="gap-row">
            <span>{g.name}</span>
            <span className="muted">{g.unclaimed_count} frame{g.unclaimed_count === 1 ? '' : 's'} unclaimed</span>
            <button onClick={() => startIdeaFromTag(g)}>Start an idea</button>
          </div>
        ))}
        {gaps.length === 0 && <p className="muted">No gaps right now — every tagged frame is in an idea.</p>}
      </div>
    </div>
  );
}
