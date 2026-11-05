import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';

type Cfg = {
  enabled: boolean; host: string; collectionId: number | null; photographerName: string; tagline: string; accentColor: string;
  buttons: { short: string; name: string; url: string }[]; gear: string; footer: string;
  fullSize: 'resized' | 'original' | 'none'; captions: boolean; order: 'collection' | 'newest' | 'oldest' | 'captured';
};
type Data = { config: Cfg; status: { photoCount: number; collection: { id: number; name: string } | null }; collections: { id: number; name: string; n: number }[]; dnsTarget: string; originalsAllowed: boolean };

/** The public portfolio website: what it shows, who it is for, and how it looks. */
export function PortfolioSettings() {
  const d = useApi<Data>('/portfolio');
  const prof = useApi<{ displayName: string; hasAvatar: boolean }>('/profile');
  const [f, setF] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { me } = useStore();
  useEffect(() => { if (d.data) setF(d.data.config); }, [d.data]);
  if (!d.data || !f) return <p className="empty">Loading…</p>;
  const set = (p: Partial<Cfg>) => setF({ ...f, ...p });
  const save = async (body: Partial<Cfg>, ok = 'Saved.') => {
    setMsg(null);
    try { await api('/portfolio', { method: 'PUT', body }); d.reload(); setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const makeCollection = async () => {
    const c = await api<{ id: number }>('/collections', { body: { name: 'Portfolio', description: 'Shown on the public portfolio website' } });
    await save({ collectionId: c.id }, 'Created a “Portfolio” composition. Add photos to it from any photo’s page.');
  };
  const { status } = d.data;
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <div className="field toggle">
        <div>
          <h3 style={{ fontSize: 19 }}>Publish the portfolio</h3>
          <p style={{ margin: 0 }}>A public website of the photos in one composition. {f.enabled ? <>It is live at <a className="t2" style={{ textDecoration: 'underline' }} href="/portfolio/" target="_blank" rel="noreferrer">/portfolio/</a>, with {status.photoCount} {status.photoCount === 1 ? 'photo' : 'photos'}.</> : 'Off: nothing is public.'}</p>
        </div>
        <button className={'sw' + (f.enabled ? ' on' : '')} role="switch" aria-checked={f.enabled} aria-label="Publish the portfolio" onClick={() => save({ enabled: !f.enabled }, f.enabled ? 'The portfolio is off.' : 'The portfolio is live.')} />
      </div>

      <div className="field">
        <h3>Which photos</h3>
        <p>The portfolio shows the photos in this composition, and only those. Add or remove photos from a photo’s own page, or edit the composition.</p>
        <div className="form">
          <select aria-label="Portfolio composition" value={f.collectionId ?? ''} onChange={(e) => save({ collectionId: e.target.value ? Number(e.target.value) : null }, 'Composition chosen.')}>
            <option value="">Choose a composition…</option>
            {d.data.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
          </select>
          {!f.collectionId && <button className="pill" onClick={makeCollection}>Create a “Portfolio” composition</button>}
          <select aria-label="Order" value={f.order} onChange={(e) => save({ order: e.target.value as Cfg['order'] }, 'Order saved.')}>
            <option value="collection">In the composition’s order</option><option value="newest">Newest added first</option><option value="oldest">Oldest added first</option><option value="captured">Newest taken first</option>
          </select>
        </div>
      </div>

      <div className="field">
        <h3>The site</h3>
        <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520 }}>
          <div aria-label="Your name and picture, from your profile" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {prof.data?.hasAvatar && <img src="/api/profile/avatar" alt="" width={44} height={44} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
            <span><b>{prof.data?.displayName || f.photographerName || 'No name yet'}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>Your name and picture come from your profile and cannot be changed here. <a className="t2" style={{ textDecoration: 'underline' }} href="/settings?section=profile">Change them in your profile</a>.</span></span>
          </div>
          <label>Tagline <input aria-label="Tagline" value={f.tagline} placeholder="Film photographer from…" onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label>Accent colour <input aria-label="Accent colour" value={f.accentColor} placeholder="coral, #d2691e or oklch(0.58 0.13 35)" onChange={(e) => set({ accentColor: e.target.value })} /></label>
          <label>Footer text <input aria-label="Footer text" value={f.footer} placeholder="Blank hides the footer" onChange={(e) => set({ footer: e.target.value })} /></label>
        </div>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={f.captions} onChange={(e) => save({ captions: e.target.checked })} /> Show the camera and film under a photo that is opened</label>
        <div style={{ marginTop: 12 }}><button className="pill primary" onClick={() => save({ tagline: f.tagline, accentColor: f.accentColor, footer: f.footer })}>Save the site details</button></div>
      </div>

      <div className="field">
        <h3>Buttons on the site</h3>
        <p>Links shown in the portfolio’s header, in this order. The short name is used where space is tight, like on a phone: an emoji or up to 4 letters.</p>
        {f.buttons.length === 0 && <p className="muted">No buttons. The header shows your name only.</p>}
        {f.buttons.length > 0 && (
          <div role="table" aria-label="Buttons on the site" style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1.6fr auto', gap: 8, alignItems: 'center', maxWidth: 720, marginBottom: 12 }}>
            {['Short', 'Full name', 'Link', ''].map((h, i) => <div key={i} className="faint" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</div>)}
            {f.buttons.map((b, i) => {
              const edit = (patch: Partial<Cfg['buttons'][number]>) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              const move = (by: number) => { const k = i + by; if (k < 0 || k >= f.buttons.length) return; const next = [...f.buttons]; [next[i], next[k]] = [next[k], next[i]]; set({ buttons: next }); };
              return (
                <div key={i} style={{ display: 'contents' }}>
                  <input aria-label={`Button ${i + 1} short name`} value={b.short} onChange={(e) => edit({ short: Array.from(e.target.value).slice(0, 4).join('') })} />
                  <input aria-label={`Button ${i + 1} full name`} value={b.name} placeholder="Instagram" onChange={(e) => edit({ name: e.target.value })} />
                  <input aria-label={`Button ${i + 1} link`} value={b.url} placeholder="https://…" onChange={(e) => edit({ url: e.target.value })} />
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="t2" aria-label={`Move button ${i + 1} up`} disabled={i === 0} onClick={() => move(-1)}>↑</button>
                    <button className="t2" aria-label={`Move button ${i + 1} down`} disabled={i === f.buttons.length - 1} onClick={() => move(1)}>↓</button>
                    <button className="t2 danger" aria-label={`Remove button ${i + 1}`} onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })}>×</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="pill" disabled={f.buttons.length >= 8} onClick={() => set({ buttons: [...f.buttons, { short: '', name: '', url: '' }] })}>+ Add a button</button>
          <button className="pill primary" onClick={() => save({ buttons: f.buttons }, 'Buttons saved.')}>Save buttons</button>
        </div>
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
          {([['resized', 'A resized copy', 'Up to 2400 px, with all camera data removed. Recommended.'], ['original', 'The original file', 'Full resolution. The file can contain camera data and the place it was taken. RAW and TIFF files still get the resized copy.'], ['none', 'Nothing extra', 'The gallery picture only.']] as const).map(([v, t, h]) => {
            const locked = v === 'original' && !d.data!.originalsAllowed;
            return (
              <button key={v} role="radio" aria-checked={f.fullSize === v && !locked} aria-disabled={locked} className={'opt' + (f.fullSize === v && !locked ? ' sel' : '')} style={locked ? { cursor: 'not-allowed' } : undefined} onClick={() => { if (!locked) save({ fullSize: v }, 'Saved.'); }}>
                <span style={{ display: 'block', opacity: locked ? 0.55 : 1 }}><b>{t}</b>{h}{v === 'original' && !locked && <span className="w">Only choose this if you are happy for people to download the originals.</span>}</span>
                {locked && (
                  <span style={{ display: 'block', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--text2)' }}>
                    Switched off on this server.{' '}
                    {me?.role === 'admin' ? <a href="/settings?section=libraries-storage" style={{ color: 'var(--text)', textDecoration: 'underline' }}>Allow it under Administration, Photo folders</a> : <span>Ask an administrator to allow it.</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <h3>Its own web address</h3>
        <p>Optional. If you give the portfolio its own name (for example <span className="mono">photography.example.com</span>) and point a tunnel or reverse proxy at Frames, that name shows <b>only</b> the portfolio. Nothing else of Frames can be reached through it, so it is safe to make public. Without a name, the portfolio is at <span className="mono">/portfolio/</span> on this server.</p>
        <div className="form"><input aria-label="Portfolio hostname" style={{ minWidth: 320 }} value={f.host} placeholder="photography.example.com" onChange={(e) => set({ host: e.target.value })} /><button className="pill" onClick={() => save({ host: f.host }, 'Address saved.')}>Save address</button></div>
        {d.data.config.host && (
          <div style={{ marginTop: 12 }}>
            <p style={{ marginBottom: 6 }}><b>DNS for {d.data.config.host}</b>: at the company that manages this domain, add a record that points it at this Frames.</p>
            {d.data.dnsTarget
              ? <div className="row"><span className="mono" style={{ userSelect: 'all' }}>{d.data.config.host}</span><span className="faint">CNAME → <span className="mono" style={{ userSelect: 'all' }}>{d.data.dnsTarget}</span> (proxied, if it is on Cloudflare)</span></div>
              : <p className="muted">Set the App URL under Settings, Cloudflare tunnel first: the record points at that address.</p>}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>If the domain is on the same Cloudflare account as the tunnel, Frames makes this record and the route itself, and lets the portfolio through Cloudflare Access without a login.</p>
          </div>
        )}
      </div>
    </>
  );
}
