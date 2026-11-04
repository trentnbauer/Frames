import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { tunnelNote } from '../tunnelNote';

type Cfg = {
  enabled: boolean; host: string; collectionId: number | null; photographerName: string; tagline: string; accentColor: string;
  social: { instagram: string; twitter: string; behance: string }; gear: string; footer: string;
  fullSize: 'resized' | 'original' | 'none'; captions: boolean; order: 'collection' | 'newest' | 'oldest' | 'captured';
};
type Data = { config: Cfg; status: { photoCount: number; collection: { id: number; name: string } | null }; collections: { id: number; name: string; n: number }[] };

/** The public portfolio website: what it shows, who it is for, and how it looks. */
export function PortfolioSettings() {
  const d = useApi<Data>('/portfolio');
  const [f, setF] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (d.data) setF(d.data.config); }, [d.data]);
  if (!d.data || !f) return <p className="empty">Loading…</p>;
  const set = (p: Partial<Cfg>) => setF({ ...f, ...p });
  const save = async (body: Partial<Cfg>, ok = 'Saved.') => {
    setMsg(null);
    try { const r = await api<{ tunnel?: { updated?: boolean; applied?: boolean; error?: string } | null }>('/portfolio', { method: 'PUT', body }); d.reload(); setMsg({ ok: true, text: ok + tunnelNote(r.tunnel) }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const makeCollection = async () => {
    const c = await api<{ id: number }>('/collections', { body: { name: 'Portfolio', description: 'Shown on the public portfolio website' } });
    await save({ collectionId: c.id }, 'Created a “Portfolio” collection. Add photos to it from any photo’s page.');
  };
  const { status } = d.data;
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <div className="field toggle">
        <div>
          <h3 style={{ fontSize: 19 }}>Publish the portfolio</h3>
          <p style={{ margin: 0 }}>A public website of the photos in one collection. {f.enabled ? <>It is live at <a className="t2" style={{ textDecoration: 'underline' }} href="/portfolio/" target="_blank" rel="noreferrer">/portfolio/</a>, with {status.photoCount} {status.photoCount === 1 ? 'photo' : 'photos'}.</> : 'Off: nothing is public.'}</p>
        </div>
        <button className={'sw' + (f.enabled ? ' on' : '')} role="switch" aria-checked={f.enabled} aria-label="Publish the portfolio" onClick={() => save({ enabled: !f.enabled }, f.enabled ? 'The portfolio is off.' : 'The portfolio is live.')} />
      </div>

      <div className="field">
        <h3>Which photos</h3>
        <p>The portfolio shows the photos in this collection, and only those. Add or remove photos from a photo’s own page, or edit the collection.</p>
        <div className="form">
          <select aria-label="Portfolio collection" value={f.collectionId ?? ''} onChange={(e) => save({ collectionId: e.target.value ? Number(e.target.value) : null }, 'Collection chosen.')}>
            <option value="">Choose a collection…</option>
            {d.data.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
          </select>
          {!f.collectionId && <button className="pill" onClick={makeCollection}>Create a “Portfolio” collection</button>}
          <select aria-label="Order" value={f.order} onChange={(e) => save({ order: e.target.value as Cfg['order'] }, 'Order saved.')}>
            <option value="collection">In the collection’s order</option><option value="newest">Newest added first</option><option value="oldest">Oldest added first</option><option value="captured">Newest taken first</option>
          </select>
        </div>
      </div>

      <div className="field">
        <h3>The site</h3>
        <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520 }}>
          <label>Your name <input aria-label="Photographer name" value={f.photographerName} onChange={(e) => set({ photographerName: e.target.value })} /></label>
          <label>Tagline <input aria-label="Tagline" value={f.tagline} placeholder="Film photographer from…" onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label>Accent colour <input aria-label="Accent colour" value={f.accentColor} placeholder="coral, #d2691e or oklch(0.58 0.13 35)" onChange={(e) => set({ accentColor: e.target.value })} /></label>
          {(['instagram', 'twitter', 'behance'] as const).map((k) => (
            <label key={k}>{k[0].toUpperCase() + k.slice(1)} link <input aria-label={`${k} link`} value={f.social[k]} placeholder="https://…  (blank hides it)" onChange={(e) => set({ social: { ...f.social, [k]: e.target.value } })} /></label>
          ))}
          <label>Footer text <input aria-label="Footer text" value={f.footer} placeholder="Blank hides the footer" onChange={(e) => set({ footer: e.target.value })} /></label>
        </div>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={f.captions} onChange={(e) => save({ captions: e.target.checked })} /> Show the camera and film under a photo that is opened</label>
        <div style={{ marginTop: 12 }}><button className="pill primary" onClick={() => save({ photographerName: f.photographerName, tagline: f.tagline, accentColor: f.accentColor, social: f.social, footer: f.footer })}>Save the site details</button></div>
      </div>

      <div className="field">
        <h3>My gear</h3>
        <p>Shown when a visitor presses “My Gear”. Simple Markdown: <span className="mono"># Heading</span>, <span className="mono">- list item</span>, <span className="mono">**bold**</span>, <span className="mono">[link](https://…)</span>.</p>
        <textarea className="area" rows={10} aria-label="Gear page" style={{ maxWidth: 560 }} value={f.gear} onChange={(e) => set({ gear: e.target.value })} />
        <div style={{ marginTop: 8 }}><button className="pill" onClick={() => save({ gear: f.gear }, 'Gear page saved.')}>Save the gear page</button></div>
      </div>

      <div className="field">
        <h3>What a visitor gets when they open a photo</h3>
        <div className="cards2" role="radiogroup" aria-label="Full size">
          {([['resized', 'A resized copy', 'Up to 2400 px, with all camera data removed. Recommended.'], ['original', 'The original file', 'Full resolution. The file can contain camera data and the place it was taken. RAW and TIFF files still get the resized copy.'], ['none', 'Nothing extra', 'The gallery picture only.']] as const).map(([v, t, h]) => (
            <button key={v} role="radio" aria-checked={f.fullSize === v} className={'opt' + (f.fullSize === v ? ' sel' : '')} onClick={() => save({ fullSize: v }, 'Saved.')}><b>{t}</b>{h}{v === 'original' && <span className="w">Only choose this if you are happy for people to download the originals.</span>}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <h3>Its own web address</h3>
        <p>Optional. If you give the portfolio its own name (for example <span className="mono">photography.example.com</span>) and point a tunnel or reverse proxy at Frames, that name shows <b>only</b> the portfolio. Nothing else of Frames can be reached through it, so it is safe to make public. Without a name, the portfolio is at <span className="mono">/portfolio/</span> on this server.</p>
        <div className="form"><input aria-label="Portfolio hostname" style={{ minWidth: 320 }} value={f.host} placeholder="photography.example.com" onChange={(e) => set({ host: e.target.value })} /><button className="pill" onClick={() => save({ host: f.host }, 'Address saved.')}>Save address</button></div>
      </div>
    </>
  );
}
