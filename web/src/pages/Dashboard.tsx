import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import type { ComboSuggestion, Idea, IdeaPhoto } from '../types.js';
import { relativeTime } from '../relativeTime.js';
import { useToast } from '../toast.js';

interface Props {
  ideas: Idea[];
  onOpenProject: (id: number) => void;
  onImport: () => void;
  onNewProject: () => void;
  onGenerateProject: (title: string, onCreated: (idea: Idea) => void | Promise<void>) => void;
}

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);

export function Dashboard({ ideas, onOpenProject, onImport, onNewProject, onGenerateProject }: Props) {
  const [details, setDetails] = useState<Record<number, IdeaPhoto[]>>({});
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [combos, setCombos] = useState<ComboSuggestion[]>([]);
  const [comboIndex, setComboIndex] = useState(0);
  const [search, setSearch] = useState('');
  const showToast = useToast();

  useEffect(() => {
    Promise.all(ideas.map((idea) => api.ideas.get(idea.id).then((res) => [idea.id, res.photos] as const))).then((pairs) => {
      setDetails(Object.fromEntries(pairs));
    });
  }, [ideas]);

  useEffect(() => {
    api.photos.list({ limit: 1 }).then((res) => setTotalPhotos(res.total));
  }, [ideas]);

  useEffect(() => {
    api.discovery.comboSuggestions().then((res) => setCombos(res.combos));
  }, []);

  useEffect(() => {
    if (combos.length <= 1) return;
    const timer = setInterval(() => setComboIndex((i) => (i + 1) % combos.length), 5000);
    return () => clearInterval(timer);
  }, [combos.length]);

  const suggestion = combos[comboIndex % Math.max(combos.length, 1)];

  const visibleIdeas = useMemo(
    () => ideas.filter((i) => i.title.toLowerCase().includes(search.trim().toLowerCase())),
    [ideas, search]
  );

  async function generateFromSuggestion() {
    if (!suggestion) return;
    const title = `${cap(suggestion.main)} ${suggestion.connector} ${suggestion.type === 'tag_tag' ? cap(suggestion.secondary) : suggestion.secondary}`;
    onGenerateProject(title, async (idea) => {
      const matches = await api.photos.list(
        suggestion.type === 'tag_location'
          ? { tag: suggestion.slug, location: suggestion.secondary }
          : suggestion.type === 'camera_location'
            ? { camera: suggestion.main, location: suggestion.secondary }
            : { tag: suggestion.slug, tag2: suggestion.secondarySlug }
      );
      for (const photo of matches.photos) {
        await api.ideas.addPhoto(idea.id, photo.id);
      }
      showToast(`Created "${title}" with ${matches.photos.length} photo${matches.photos.length === 1 ? '' : 's'}`);
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="page-subtitle">{totalPhotos} photos across {ideas.length} project{ideas.length === 1 ? '' : 's'}</div>
        </div>
        <div className="page-header__actions">
          <button className="btn" onClick={onImport}>Import Photos</button>
          <button className="btn btn-accent" onClick={onNewProject}>+ New Idea</button>
        </div>
      </div>

      {suggestion && (
        <div className="suggestion-banner">
          <div>
            <div className="suggestion-banner__label">Suggested project</div>
            <div className="suggestion-banner__text" key={comboIndex}>
              {cap(suggestion.main)} {suggestion.connector} {suggestion.type === 'tag_tag' ? cap(suggestion.secondary) : suggestion.secondary}
            </div>
          </div>
          <button className="btn btn-accent" onClick={generateFromSuggestion}>Generate Project</button>
        </div>
      )}

      {ideas.length > 0 && (
        <input
          className="field-input search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
        />
      )}

      <div className="project-grid">
        {visibleIdeas.map((idea) => {
          const photos = details[idea.id] ?? [];
          const tagPreview = Array.from(new Set(photos.flatMap((p) => p.tags.map((t) => t.name)))).slice(0, 3);
          return (
            <button key={idea.id} className="project-card" onClick={() => onOpenProject(idea.id)}>
              <div className="project-card__cover">
                {Array.from({ length: 4 }).map((_, i) => {
                  const photo = photos[i];
                  return (
                    <div
                      key={i}
                      className="project-card__cover-tile"
                      style={photo ? { backgroundImage: `url(/files/thumb/${photo.id})` } : undefined}
                    />
                  );
                })}
              </div>
              <div className="project-card__body">
                <div className="project-card__name">
                  {idea.title}
                  {!idea.photo_count && <span className="idea-badge">IDEA</span>}
                </div>
                <div className="project-card__meta">
                  {idea.photo_count ?? 0} photo{idea.photo_count === 1 ? '' : 's'} · {relativeTime(idea.created_at)}
                </div>
                <div>
                  {tagPreview.map((t) => (
                    <span key={t} className="tag-pill" style={{ marginRight: 6 }}>{t}</span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
        {ideas.length === 0 && <p className="muted">No projects yet. Start one from a tag you keep noticing.</p>}
        {ideas.length > 0 && visibleIdeas.length === 0 && <p className="muted">No projects match "{search}".</p>}
      </div>
    </div>
  );
}
