import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';
import { SignInMethods } from './SignInMethods';

type P = { displayName: string; hasAvatar: boolean; signedInAs: string; country: string; seasons: 'auto' | 'north' | 'south' | 'off'; hemisphere: 'north' | 'south' | 'none'; tz: string };

const COUNTRIES = ['Australia', 'New Zealand', 'South Africa', 'Argentina', 'Brazil', 'Chile', 'Uruguay', 'Paraguay', 'Peru', 'Bolivia', 'Madagascar', 'Mozambique', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia', 'Fiji', 'Samoa', 'Tonga', 'Mauritius', 'United Kingdom', 'Ireland', 'United States', 'Canada', 'Mexico', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Portugal', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Czechia', 'Greece', 'Turkey', 'Israel', 'India', 'China', 'Japan', 'South Korea', 'Taiwan', 'Hong Kong', 'Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Kenya', 'Nigeria', 'Egypt', 'Morocco', 'Ecuador', 'Colombia', 'Other'];

/** Shrinks a chosen picture to a 256 pixel square in the browser, so only a small JPEG is sent. */
function squareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

/** The name and picture that stand for you. The portfolio shows them. */
export function Profile() {
  const p = useApi<P>('/profile');
  const { refreshMe } = useStore();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bust, setBust] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.data) setName(p.data.displayName); }, [p.data?.displayName]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p.data) return <p className="empty">Loading…</p>;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setBust(Date.now()); p.reload(); refreshMe(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <div className="field">
        <h3>Display picture</h3>
        <p>Shown at the top of the page and on your public portfolio. It is cropped to a square.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {p.data.hasAvatar
            ? <img src={`/api/profile/avatar?v=${bust}`} alt="Your display picture" width={96} height={96} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            : <div aria-hidden style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 34, color: 'var(--muted)' }}>{(p.data.displayName || p.data.signedInAs || '?').trim().charAt(0).toUpperCase()}</div>}
          <div className="form">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a display picture" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (f) await run(async () => api('/profile/avatar', { method: 'PUT', body: { image: await squareJpeg(f) } }), 'Picture saved.');
            }} />
            <button className="pill" onClick={() => file.current?.click()}>{p.data.hasAvatar ? 'Change picture' : 'Choose a picture'}</button>
            {p.data.hasAvatar && <button className="pill" onClick={() => run(() => api('/profile/avatar', { method: 'DELETE' }), 'Picture removed.')}>Remove</button>}
          </div>
        </div>
      </div>
      <div className="field">
        <h3>Display name</h3>
        <p>Shown at the top of the page and on your public portfolio. {p.data.signedInAs && <>Your sign-in says <b>{p.data.signedInAs}</b>; this does not change it, and signing in again will not overwrite it.</>}</p>
        <div className="form">
          <input aria-label="Display name" value={name} maxLength={80} placeholder={p.data.signedInAs || 'Your name'} onChange={(e) => setName(e.target.value)} style={{ minWidth: 280 }} />
          <button className="pill primary" disabled={name.trim() === p.data.displayName} onClick={() => run(() => api('/profile', { method: 'PUT', body: { displayName: name } }), 'Name saved.')}>Save</button>
        </div>
      </div>
      <div className="field">
        <h3>Country</h3>
        <p>Sets the hemisphere for photo seasons, and appears on your public portfolio under your tagline.</p>
        <div className="form"><select value={p.data.country} onChange={(e) => run(() => api('/profile', { method: 'PUT', body: { country: e.target.value } }), 'Country saved.')} aria-label="Country"><option value="">Choose…</option>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </div>
      <div className="field">
        <h3>Seasons</h3>
        <p>Photos get a season chip from their date. Auto follows your country{p.data.seasons === 'auto' && p.data.hemisphere === 'none' ? ', and near the equator it shows no seasons' : ''}.</p>
        <div className="seg">{([['auto', 'Auto (from country)'], ['north', 'Northern'], ['south', 'Southern'], ['off', 'Don’t show seasons']] as const).map(([k, l]) => <button key={k} className={p.data!.seasons === k ? 'on' : ''} onClick={() => run(() => api('/profile', { method: 'PUT', body: { seasons: k } }), 'Seasons saved.')}>{l}</button>)}</div>
      </div>
      <div className="field">
        <h3>Time zone</h3>
        <p>Used for quiet hours and when reminder emails go out. Taken from this browser until you change it.</p>
        <div className="form"><input aria-label="Time zone" defaultValue={p.data.tz || Intl.DateTimeFormat().resolvedOptions().timeZone} onBlur={(e) => e.target.value && e.target.value !== p.data!.tz && run(() => api('/profile', { method: 'PUT', body: { tz: e.target.value } }), 'Time zone saved.')} style={{ width: 240 }} /></div>
      </div>
      <SignInMethods />
    </>
  );
}
