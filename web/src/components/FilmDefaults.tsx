import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { usePrefs } from '../settings/hooks';

/** The film defaults strip on the Gear page: the film stock used for scans without camera data, and whether to ask for it. */
export function FilmDefaults() {
  const { settings: s, setSettings } = useStore();
  const prefs = usePrefs('user');
  const g = s?.gear;
  const [film, setFilm] = useState(g?.film ?? '');
  const [error, setError] = useState('');
  useEffect(() => { setFilm(g?.film ?? ''); }, [g?.film]);
  if (!s) return null;
  const ask = prefs.get('filmTag', true);
  const commit = async () => {
    const v = film.trim();
    if (v === (g?.film ?? '')) return;
    setError('');
    try { await setSettings({ gear: { ...(g ?? { camera: '', lens: '', medium: '' }), film: v, medium: v ? 'film' : (g?.medium ?? '') } } as never); }
    catch (e) { setError((e as Error).message); setFilm(g?.film ?? ''); }
  };
  return (
    <section aria-label="Film defaults" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '14px 20px', marginBottom: 16, borderRadius: 12, background: 'var(--surface)' }}>
      <span className="eyebrow" style={{ flex: 'none' }}>Film defaults</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
        Default film stock
        <input className="field-in" aria-label="Default film stock" value={film} placeholder="Portra 400" onChange={(e) => setFilm(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ height: 32, width: 170, borderRadius: 999 }} />
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>For scans without camera data</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, marginLeft: 'auto' }}>
        <input type="checkbox" checked={!!ask} onChange={(e) => prefs.set('filmTag', e.target.checked)} />
        Ask for the film on new scans
      </label>
      {error && <span role="alert" style={{ color: 'var(--err)', fontSize: 12.5 }}>{error}</span>}
    </section>
  );
}
