import { useEffect, useState } from 'react';
import { useApi } from '../api';

export type Gear = { camera: string; lens: string; medium: '' | 'digital' | 'film'; film: string };
export const NO_GEAR: Gear = { camera: '', lens: '', medium: '', film: '' };

/**
 * Camera details that photographs start with when their file has none: for every new photograph (Settings) or for one photoshoot.
 * They only fill blanks. Nothing the file says, and nothing you typed on a photograph, is replaced.
 */
export function GearDefaults({ value, onSave, label }: { value: Gear | undefined; onSave: (g: Gear) => Promise<void> | void; label: string }) {
  const gear = useApi<{ cameras: { name: string }[]; lenses: { name: string }[]; films: { name: string }[] }>('/gear');
  const [g, setG] = useState<Gear>(value ?? NO_GEAR);
  const [saved, setSaved] = useState(false);
  useEffect(() => setG(value ?? NO_GEAR), [value?.camera, value?.lens, value?.medium, value?.film]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<Gear>) => { setG({ ...g, ...p }); setSaved(false); };
  const dirty = JSON.stringify(g) !== JSON.stringify(value ?? NO_GEAR);
  const id = label.replace(/\W/g, '');
  return (
    <div className="form" aria-label={label}>
      <datalist id={`${id}-cameras`}>{(gear.data?.cameras ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <datalist id={`${id}-lenses`}>{(gear.data?.lenses ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <datalist id={`${id}-films`}>{(gear.data?.films ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <label>Camera <input value={g.camera} list={`${id}-cameras`} onChange={(e) => set({ camera: e.target.value })} aria-label={`${label}: camera`} /></label>
      <label>Lens <input value={g.lens} list={`${id}-lenses`} onChange={(e) => set({ lens: e.target.value })} aria-label={`${label}: lens`} /></label>
      <label>Film or digital{' '}
        <select value={g.medium} onChange={(e) => set({ medium: e.target.value as Gear['medium'], film: e.target.value === 'film' ? g.film : '' })} aria-label={`${label}: film or digital`}>
          <option value="">Not set</option><option value="digital">Digital</option><option value="film">Film</option>
        </select>
      </label>
      {g.medium === 'film' && <label>Film stock <input value={g.film} list={`${id}-films`} onChange={(e) => set({ film: e.target.value })} placeholder="e.g. Kodak Gold 200" aria-label={`${label}: film stock`} /></label>}
      <button className="pill primary" disabled={!dirty} onClick={async () => { await onSave(g); setSaved(true); }}>Save</button>
      {saved && !dirty && <span className="muted" role="status">Saved.</span>}
    </div>
  );
}
