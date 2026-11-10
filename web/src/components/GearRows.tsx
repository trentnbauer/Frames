import { useEffect, useState } from 'react';
import { useApi } from '../api';
import type { PhotoFull } from '../data';

const box = { font: 'inherit', width: '100%', background: 'none', border: 0, outline: 'none', color: 'inherit', padding: 0 } as const;
const dt = { color: 'var(--faint)' } as const;

/** One box that saves when you leave it, and shows the saved value again if the photograph changes. */
function Box({ value, label, placeholder, list, onSave, width }: { value: string; label: string; placeholder?: string; list?: string; onSave: (v: string) => void; width?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input value={v} aria-label={label} placeholder={placeholder} list={list} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onSave(v.trim())} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ ...box, ...(width ? { width } : {}) }} />;
}

/**
 * Camera details on the photograph page: what the file said, which you can correct or fill in. They are extras, never required.
 * Film or digital, with a film stock to type and search from the ones already in your library.
 */
export function GearRows({ p, patch }: { p: PhotoFull; patch: (body: Record<string, unknown>) => Promise<void> }) {
  const gear = useApi<{ cameras: { name: string }[]; lenses: { name: string }[]; films: { name: string }[] }>('/gear');
  const num = (k: 'iso' | 'aperture' | 'focalMm', lo: number, hi: number) => (v: string) => {
    const n = Number(v);
    void patch({ [k]: v === '' ? null : Number.isFinite(n) && n >= lo && n <= hi ? n : undefined });
  };
  return (
    <>
      <datalist id="gear-cameras">{(gear.data?.cameras ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <datalist id="gear-lenses">{(gear.data?.lenses ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <datalist id="gear-films">{(gear.data?.films ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <dt style={dt}>Medium</dt>
      <dd style={{ margin: 0 }}>
        <select aria-label="Film or digital" value={p.medium} onChange={(e) => void patch({ medium: e.target.value })} style={{ font: 'inherit', background: 'none', color: 'inherit', border: 0, padding: 0 }}>
          <option value="">–</option><option value="digital">Digital</option><option value="film">Film</option>
        </select>
      </dd>
      {p.medium === 'film' && <><dt style={dt}>Film</dt><dd style={{ margin: 0 }}><Box value={p.film} label="Film stock" placeholder="e.g. Kodak Gold 200" list="gear-films" onSave={(v) => void patch({ film: v })} /></dd></>}
      <dt style={dt}>Camera</dt><dd style={{ margin: 0 }}><Box value={p.camera} label="Camera" placeholder="Camera" list="gear-cameras" onSave={(v) => void patch({ camera: v })} /></dd>
      <dt style={dt}>Lens</dt><dd style={{ margin: 0 }}><Box value={p.lens} label="Lens" placeholder="Lens" list="gear-lenses" onSave={(v) => void patch({ lens: v })} /></dd>
      <dt style={dt}>Exposure</dt>
      <dd style={{ margin: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>ISO <Box value={p.iso === null ? '' : String(p.iso)} label="ISO" placeholder="–" onSave={num('iso', 1, 10_000_000)} width={46} /></span>
        <span>f/ <Box value={p.aperture === null ? '' : String(p.aperture)} label="Aperture" placeholder="–" onSave={num('aperture', 0.5, 128)} width={36} /></span>
        <span><Box value={p.shutter} label="Shutter speed" placeholder="1/250" onSave={(v) => void patch({ shutter: v })} width={56} />s</span>
        <span><Box value={p.focalMm === null ? '' : String(p.focalMm)} label="Focal length" placeholder="–" onSave={num('focalMm', 1, 3000)} width={36} />mm</span>
      </dd>
    </>
  );
}
