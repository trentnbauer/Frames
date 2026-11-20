import { useEffect, useState } from 'react';
import { useApi } from '../api';
import { SegSlider } from './SegSlider';

type Plan = { slides: { id: number; part: number; of: number }[]; width: number; height: number };
const RATIOS = ['4:5', '3:4', '1:1'] as const;
const COLOURS: [string, string][] = [['ffffff', 'White'], ['000000', 'Black'], ['efede8', 'Paper']];

/**
 * Instagram carousel slides from the chosen photographs, in the order they were picked: each fitted inside a border, or a wide one
 * split across slides so it scrolls as one picture. The previews here are the real slides, made by the server.
 */
export function CarouselMaker({ ids }: { ids: number[] }) {
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>('4:5');
  const [border, setBorder] = useState(5), [settled, setSettled] = useState(5);
  const [colour, setColour] = useState('ffffff');
  const [per, setPer] = useState<'one' | 'two' | 'split'>('one'); // per slide: one photo, two photos, or wide ones split across slides
  const [sharing, setSharing] = useState(false), [err, setErr] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setSettled(border), 300); return () => window.clearTimeout(t); }, [border]);
  const most = per === 'two' ? 40 : 20;
  const q = new URLSearchParams({ ids: ids.slice(0, most).join(','), ratio, border: String(settled), colour, split: String(per === 'split'), pair: String(per === 'two') }).toString();
  const plan = useApi<Plan>(`/carousel?${q}`);
  const slides = plan.data?.slides ?? [];
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'x.jpg', { type: 'image/jpeg' })] });
  // On a phone the slides go straight to the share sheet (Save to Photos, or Instagram itself).
  const share = async () => {
    setErr(''); setSharing(true);
    try {
      const files = await Promise.all(slides.map(async (_, i) => {
        const r = await fetch(`/api/carousel/slide/${i}?${q}`);
        if (!r.ok) throw new Error('A slide could not be made. Try again.');
        return new File([await r.blob()], `slide-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' });
      }));
      await navigator.share({ files });
    } catch (e) { if ((e as Error).name !== 'AbortError') setErr((e as Error).message); }
    finally { setSharing(false); }
  };
  const label = { fontSize: 13, color: 'var(--muted)', minWidth: 64 } as const;
  const row = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, accentColor: 'var(--text)' }}>
      {ids.length > most && <p className="muted" style={{ margin: 0, fontSize: 13 }}>A carousel holds 20 slides, so only the first {most} photographs are used.</p>}
      <div style={row}><span style={label}>Shape</span>
        <div className="seg" role="group" aria-label="Slide shape"><SegSlider />{RATIOS.map((r) => <button key={r} type="button" className={ratio === r ? 'on' : ''} aria-pressed={ratio === r} onClick={() => setRatio(r)}>{r}</button>)}</div>
      </div>
      <div style={row}><span style={label}>Border</span>
        <input type="range" min={0} max={25} step={1} value={border} onChange={(e) => setBorder(Number(e.target.value))} aria-label="Border width, per cent of the slide width" style={{ flex: 1, minWidth: 140 }} />
        <span className="mono" style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{border}%</span>
      </div>
      <div style={row}><span style={label}>Colour</span>
        <div className="seg" role="group" aria-label="Border colour"><SegSlider />{COLOURS.map(([c, n]) => <button key={c} type="button" className={colour === c ? 'on' : ''} aria-pressed={colour === c} onClick={() => setColour(c)}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: `#${c}`, boxShadow: 'inset 0 0 0 1px var(--outline)', marginRight: 6, verticalAlign: -1 }} />{n}</button>)}</div>
      </div>
      <div style={row}><span style={label}>Per slide</span>
        <div className="seg" role="group" aria-label="Photos per slide" style={{ flexWrap: 'wrap' }}><SegSlider />{([['one', 'One photo'], ['two', 'Two photos'], ['split', 'Split wide photos']] as const).map(([k, n]) => <button key={k} type="button" className={per === k ? 'on' : ''} aria-pressed={per === k} onClick={() => setPer(k)}>{n}</button>)}</div>
      </div>
      {per === 'split' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>A wide photo is laid across as many slides as it fills, so a panorama scrolls as one picture.</p>}
      {per === 'two' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Photos are paired in the order you picked them: two landscapes one above the other, two portraits side by side.</p>}
      <div aria-label="Slides" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, minHeight: 160 }}>
        {plan.error && <p role="alert">{plan.error}</p>}
        {!plan.data && !plan.error && <p className="muted">Making slides…</p>}
        {plan.data && !slides.length && <p className="muted">None of these photographs has a preview yet.</p>}
        {slides.map((s, i) => <img key={`${q}-${i}`} src={`/api/carousel/slide/${i}?${q}`} alt={`Slide ${i + 1} of ${slides.length}`} loading="lazy" style={{ height: 160, aspectRatio: `${plan.data!.width} / ${plan.data!.height}`, flex: 'none', borderRadius: 4, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--hair)' }} />)}
      </div>
      {err && <p role="alert" style={{ margin: 0 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span className="mono faint" style={{ fontSize: 11, marginRight: 'auto' }}>{slides.length} {slides.length === 1 ? 'slide' : 'slides'} · {plan.data ? `${plan.data.width}×${plan.data.height}` : ''}</span>
        {canShare && <button type="button" className="btn outline" disabled={!slides.length || sharing} onClick={() => void share()}>{sharing ? 'Preparing…' : 'Share…'}</button>}
        <a className="btn primary" href={slides.length ? `/api/carousel/download?${q}` : undefined} aria-disabled={!slides.length} download="carousel.zip">Download slides</a>
      </div>
    </div>
  );
}
