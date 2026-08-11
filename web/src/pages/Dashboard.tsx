import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import type { ComboSuggestion, Idea, IdeaPhoto } from '../types.js';
import { relativeTime } from '../relativeTime.js';
import { useToast } from '../toast.js';
import { getStoredLocation, setStoredLocation } from '../weatherLocation.js';
import { ColorDot } from '../components/ColorDot.js';
import { COLOR_TAG_NAMES } from '../colorNames.js';

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
            : suggestion.type === 'tag_season'
              ? { tag: suggestion.slug, season: suggestion.secondary }
              : suggestion.type === 'tag_film_stock'
                ? { tag: suggestion.slug, film_stock: suggestion.secondary }
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

      <WeatherWidget onOpenProject={onOpenProject} />
      <NudgeDigest ideas={ideas} onOpenProject={onOpenProject} />

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
          // Subject tags first, color tags only filling leftover slots — a
          // color tag appears on nearly every photo, so an unweighted
          // Set().slice(3) would show almost nothing but colors.
          const uniqueTagNames = Array.from(new Set(photos.flatMap((p) => p.tags.map((t) => t.name))));
          const tagPreview = [
            ...uniqueTagNames.filter((t) => !COLOR_TAG_NAMES.has(t)),
            ...uniqueTagNames.filter((t) => COLOR_TAG_NAMES.has(t)),
          ].slice(0, 3);
          return (
            <button key={idea.id} className="project-card" onClick={() => onOpenProject(idea.id)}>
              <div className="project-card__cover">
                {photos.length === 0 ? (
                  <div className="project-card__cover-empty">
                    <span className="project-card__cover-empty-icon">🖼</span>
                    <span>No photos yet</span>
                  </div>
                ) : (
                  Array.from({ length: 4 }).map((_, i) => {
                    const photo = photos[i];
                    return (
                      <div
                        key={i}
                        className="project-card__cover-tile"
                        style={photo ? { backgroundImage: `url(/files/thumb/${photo.id})` } : undefined}
                      />
                    );
                  })
                )}
              </div>
              <div className="project-card__body">
                <div className="project-card__name">
                  {idea.title}
                  {!idea.photo_count && <span className="idea-badge">IDEA</span>}
                </div>
                <div className="project-card__meta">
                  {idea.photo_count ?? 0} photo{idea.photo_count === 1 ? '' : 's'} · {relativeTime(idea.created_at)}
                </div>
                {idea.nudge && <div className={`project-card__nudge project-card__nudge--${idea.nudge.type}`}>{idea.nudge.message}</div>}
                <div>
                  {tagPreview.map((t) => (
                    <span key={t} className="tag-pill" style={{ marginRight: 6 }}>
                      {COLOR_TAG_NAMES.has(t) && <ColorDot name={t} />}
                      {t}
                    </span>
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

function NudgeDigest({ ideas, onOpenProject }: { ideas: Idea[]; onOpenProject: (id: number) => void }) {
  const nudged = ideas.filter((i) => i.nudge);
  if (nudged.length === 0) return null;

  return (
    <div className="nudge-digest">
      <div className="nudge-digest__title">Needs attention</div>
      {nudged.map((idea) => (
        <button key={idea.id} className="nudge-digest__row" onClick={() => onOpenProject(idea.id)}>
          <span className="nudge-digest__idea">{idea.title}</span>
          <span className="muted">{idea.nudge!.message}</span>
        </button>
      ))}
    </div>
  );
}

interface WeatherResult {
  place: { name: string; country: string | null };
  weather: { temperatureC: number; cloudCoverPct: number; precipitationMm: number; isDay: boolean };
  lightConditions: string;
  ideas: Idea[];
}

function formatLightConditions(v: string): string {
  return v.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function WeatherWidget({ onOpenProject }: { onOpenProject: (id: number) => void }) {
  const [location, setLocation] = useState(() => getStoredLocation());
  const [locationInput, setLocationInput] = useState(location);
  const [editing, setEditing] = useState(!location);
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!location) return;
    setLoading(true);
    setError(null);
    api.weather
      .today(location)
      .then((res) => setResult(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load weather'))
      .finally(() => setLoading(false));
  }, [location]);

  function saveLocation() {
    const trimmed = locationInput.trim();
    if (!trimmed) return;
    setStoredLocation(trimmed);
    setLocation(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="weather-widget">
        <div className="weather-widget__title">What can I shoot today?</div>
        <p className="muted">Set a location to see today's light conditions and which active ideas fit.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="field-input"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveLocation()}
            placeholder="City, e.g. Melbourne"
          />
          <button className="btn btn-accent" onClick={saveLocation}>Save</button>
          {location && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="weather-widget">
      <div className="weather-widget__head">
        <div className="weather-widget__title">What can I shoot today?</div>
        <span className="link-button" style={{ marginLeft: 0, cursor: 'pointer' }} onClick={() => { setLocationInput(location); setEditing(true); }}>
          Change location
        </span>
      </div>

      {loading && <p className="muted">Checking the sky over {location}…</p>}
      {error && <p className="muted">{error}</p>}

      {result && !loading && !error && (
        <>
          <div className="weather-widget__summary">
            <span className="weather-widget__light-badge">{formatLightConditions(result.lightConditions)}</span>
            <span className="muted">
              {result.place.name}
              {result.place.country ? `, ${result.place.country}` : ''} · {Math.round(result.weather.temperatureC)}°C ·{' '}
              {result.weather.cloudCoverPct}% cloud
            </span>
          </div>
          {result.ideas.length > 0 ? (
            <div className="weather-widget__ideas">
              {result.ideas.map((idea) => (
                <button key={idea.id} className="chip" onClick={() => onOpenProject(idea.id)}>{idea.title}</button>
              ))}
            </div>
          ) : (
            <p className="muted">No active ideas fit this light yet.</p>
          )}
        </>
      )}
    </div>
  );
}
