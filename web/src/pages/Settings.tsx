import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Header, Loading } from '../components/bits';
import { useStore, type Settings } from '../store';
import { PortfolioSettings } from './PortfolioSettings';
import { Access } from './Access';
import { AiSettings } from './AiSettings';
import { CloudServices, CloudSettings } from './CloudSettings';
import { TunnelSettings } from './TunnelSettings';
import { EnvExport } from './EnvExport';
import { People } from './People';
import { YourData } from './YourData';

// Yours: everything about your own library, for every signed-in person. Administrator: the whole instance (sign-in, the tunnel, people, the env file).
const YOURS = ['Reviews', 'Cloud sync', 'AI', 'Tags & subjects', 'Metadata & XMP', 'Portfolio', 'Your data'] as const;
const ADMIN = ['Access', 'Cloudflare tunnel', 'Libraries & storage', 'Cloud services', 'Shared AI', 'People', 'Backup', 'Env file'] as const;
const SECTIONS = [...YOURS, ...ADMIN, 'About'] as const;
const INTERVALS = ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'];

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="field toggle">
      <div><h3 style={{ fontSize: 19 }}>{label}</h3>{hint && <p style={{ margin: 0 }}>{hint}</p>}</div>
      <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  );
}

export function SettingsPage() {
  // Coming back from a test sign-in lands here with ?access=…, so open the Access section.
  const [sec, setSec] = useState<(typeof SECTIONS)[number]>(() => { const q = new URLSearchParams(window.location.search); return q.has('access') ? 'Access' : q.has('cloud') ? 'Cloud sync' : 'Reviews'; });
  const { settings: s, setSettings, me } = useStore();
  // Sign-in and the tunnel belong to the whole instance: only an administrator sees them.
  const isAdmin = me?.role !== 'member';
  const groups: { title: string; items: readonly (typeof SECTIONS)[number][] }[] = [{ title: 'Your settings', items: YOURS }, ...(isAdmin ? [{ title: 'Administrator', items: ADMIN }] : []), { title: 'Frames', items: ['About'] as const }];
  const [err, setErr] = useState('');
  // Settings that can be refused (for example AI without a model) report why instead of failing silently.
  const save = async (p: Partial<Settings>) => { setErr(''); try { await setSettings(p); } catch (e) { setErr((e as Error).message); } };
  if (!s) return <div className="page"><Header /><Loading /></div>;
  return (
    <div className="page">
      <Header />
      <div className="settings">
        <nav className="snav" aria-label="Settings sections">
          {groups.map((g) => (
            <div key={g.title} role="group" aria-label={g.title} style={{ display: 'contents' }}>
              <div className="faint" style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', margin: '14px 0 4px 12px' }}>{g.title}</div>
              {g.items.map((x) => <button key={x} className={sec === x ? 'on' : ''} onClick={() => { setSec(x); setErr(''); }}>{x}</button>)}
            </div>
          ))}
        </nav>
        <div>
          <h1 className="serif" style={{ fontSize: 44, marginBottom: 12 }}>{sec}</h1>
          {me?.envConfig && sec !== 'Env file' && <div className="banner" role="status"><span>Settings were loaded from your env file when Frames started, and it wins over the app: changes made here last until the next restart. See Env file to keep them.</span></div>}
          {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
          {sec === 'Reviews' && <Reviews s={s} save={save} />}
          {sec === 'AI' && <AiSettings />}
          {sec === 'Shared AI' && <AiSettings server />}
          {sec === 'Libraries & storage' && <Libraries />}
          {sec === 'Portfolio' && <PortfolioSettings />}
          {sec === 'Cloud sync' && <CloudSettings />}
          {sec === 'Cloud services' && <CloudServices />}
          {sec === 'Cloudflare tunnel' && <TunnelSettings />}
          {sec === 'People' && <People />}
          {sec === 'Env file' && <EnvExport />}
          {sec === 'Your data' && <YourData />}
          {sec === 'Access' && <Access />}
          {sec === 'Tags & subjects' && <Vocabulary />}
          {sec === 'Metadata & XMP' && <Metadata s={s} save={save} />}
          {sec === 'Backup' && <Backup />}
          {sec === 'About' && <About />}
        </div>
      </div>
    </div>
  );
}

function Reviews({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  return (
    <>
      <div className="field">
        <h3>Sessions per photo</h3><p>How many times each photograph comes back for a rating.</p>
        <div className="stepper">
          <button aria-label="Fewer sessions" onClick={() => save({ sessions: Math.max(1, s.sessions - 1) })}>−</button>
          <b>{s.sessions}</b>
          <button aria-label="More sessions" onClick={() => save({ sessions: Math.min(12, s.sessions + 1) })}>+</button>
        </div>
      </div>
      <div className="field">
        <h3>Interval after each session</h3><p>Time before a photograph returns for its next review. Tap a tile to change it.</p>
        <div className="tiles">
          {Array.from({ length: s.sessions }, (_, i) => {
            const v = s.intervals[Math.min(i, s.intervals.length - 1)];
            return <button className="tile-s" key={i} aria-label={`Interval after session ${i + 1}: ${v}`} onClick={() => {
              const next = [...s.intervals];
              while (next.length < s.sessions) next.push(next[next.length - 1] ?? '1 year');
              next[i] = INTERVALS[(INTERVALS.indexOf(v) + 1) % INTERVALS.length];
              save({ intervals: next });
            }}><b>after {i + 1}</b>{v}</button>;
          })}
        </div>
      </div>
      <Toggle on={s.adaptive} onChange={(v) => save({ adaptive: v })} label="Adapt to consistency" hint="Steady ratings come back less often. Mixed ratings come back sooner." />
      <Toggle on={s.archiveSuggest} onChange={(v) => save({ archiveSuggest: v })} label="Suggest leaving low-rated photos out of review" hint="After 4 sessions averaging under 2. They stay in your library, search and collections." />
    </>
  );
}

function Libraries() {
  const info = useApi<{ internalDir: string; libraries: { path: string; exists: boolean; lastScan: string | null }[] }>('/settings');
  return (
    <>
      <div className="field">
        <h3>Photo libraries</h3>
        <p>Folders Frames reads photographs from. External libraries are read-only: originals are never changed. They are set with LIBRARY_DIRS (see the README), and can be a cloud drive mounted as a folder.</p>
        {(info.data?.libraries ?? []).map((l) => (
          <div className="row" key={l.path}>
            <span className="mono">{l.path}{l.path === info.data?.internalDir ? '  (uploads)' : ''}</span>
            <span className={l.exists || l.path === info.data?.internalDir ? 'faint' : 'reason'}>{!l.exists && l.path !== info.data?.internalDir ? 'folder not found' : l.lastScan ? `synced ${fmtDate(l.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'not synced yet'}</span>
          </div>
        ))}
        <p style={{ marginTop: 12 }}>Photos uploaded from the <Link to="/shoots" className="t2" style={{ textDecoration: 'underline' }}>Photoshoots</Link> page are kept in Frames’ own data folder.</p>
      </div>
    </>
  );
}

function Vocabulary() {
  const [kind, setKind] = useState<'subject' | 'tag'>('subject');
  const list = useApi<{ name: string; kind: string; n: number }[]>(`/tags?kind=${kind}`);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const act = async (fn: () => Promise<unknown>) => { await fn(); list.reload(); };
  return (
    <div className="field">
      <p>Subjects are what is in a picture (a harbour, a heron). Tags are everything else: style, mood, projects. Renaming to a name that exists merges the two.</p>
      <div className="tabs" role="tablist">
        {(['subject', 'tag'] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'subject' ? 'Subjects' : 'Tags'}</button>)}
      </div>
      <form className="form" style={{ margin: '14px 0' }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) act(() => api('/tags', { body: { name, kind } })).then(() => setName('')); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${kind}`} aria-label={`New ${kind}`} />
        <button className="pill">Create</button>
      </form>
      {list.loading && <Loading error={list.error} />}
      {list.data?.length === 0 && <div className="empty" style={{ padding: '10px 0' }}>None yet.</div>}
      {list.data?.map((t) => (
        <div className="row" key={t.name}>
          {editing === t.name ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => api(`/tags/${kind}/${encodeURIComponent(t.name)}`, { method: 'PATCH', body: { name: to } })).then(() => setEditing(null)); }}>
              <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} aria-label={`Rename ${t.name}`} /><button className="pill">Save</button>
            </form>
          ) : <Link to={`/library?${kind}=${encodeURIComponent(t.name)}`}>{t.name} <span className="faint">{t.n}</span></Link>}
          <span className="t2" style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
            <button onClick={() => { setEditing(t.name); setTo(t.name); }}>Rename</button>
            <button onClick={() => { if (confirm(`Delete “${t.name}”${t.n ? ` from ${t.n} photographs` : ''}? The photographs are not touched.`)) act(() => api(`/tags/${kind}/${encodeURIComponent(t.name)}`, { method: 'DELETE' })); }}>Delete</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Metadata({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const conflicts = useApi<{ photoId: number; field: string; mine: string; theirs: string; file: string }[]>('/metadata/conflicts');
  const [res, setRes] = useState<{ written: number; writtenBeside: number; skipped: { file: string; reason: string }[] } | null>(null);
  return (
    <>
      <div className="field">
        <h3>Reading other apps’ edits</h3>
        <p>When a sidecar file (photo.jpg.xmp or photo.xmp) sits next to a photograph, Frames reads its keywords as tags, and its title and description where you have not written your own. Your own edits always win. Frames never removes tags that another app added, and never changes the image file.</p>
      </div>
      <Toggle on={s.xmpWriteBack} onChange={(v) => save({ xmpWriteBack: v })} label="Write XMP next to my originals" hint="Off by default, because libraries are read-only. Turn it on only if the library folder is mounted writable. Another program’s existing sidecar is never overwritten." />
      <div className="field">
        <h3>Export approved metadata</h3>
        <p>Your titles and descriptions, accepted tags and subjects, and average review rating, as XMP sidecars. They are always saved in Frames’ data folder{s.xmpWriteBack ? ', and beside the originals too' : ''}. You can also export one photograph from its page.</p>
        <button className="pill" onClick={async () => setRes(await api('/metadata/export', { body: {} }))}>Export all</button>
        {res && <p role="status" style={{ marginTop: 10 }}>Wrote {res.written} sidecars{res.writtenBeside > 0 && `, ${res.writtenBeside} beside the originals`}.{res.skipped.length > 0 && <span className="reason"> Skipped {res.skipped.length}: {res.skipped.slice(0, 3).map((k) => `${k.file} (${k.reason})`).join('; ')}.</span>}</p>}
      </div>
      <div className="field">
        <h3>Differences to settle</h3>
        {conflicts.data?.length === 0 && <p>None. Nothing in another app disagrees with what you wrote.</p>}
        {conflicts.data?.map((c) => (
          <div key={`${c.photoId}${c.field}`} style={{ marginBottom: 12, fontSize: 13 }}>
            <Link to={`/photo/${c.photoId}`} className="t2" style={{ textDecoration: 'underline' }}>{c.file}</Link> · <b>{c.field}</b>: yours “{c.mine}”, theirs “{c.theirs}”<br />
            {(['mine', 'theirs'] as const).map((u) => <button key={u} className="pill" style={{ marginRight: 8 }} onClick={async () => { await api('/metadata/resolve', { body: { photoId: c.photoId, field: c.field, use: u } }); conflicts.reload(); }}>{u === 'mine' ? 'Keep mine' : 'Use theirs'}</button>)}
          </div>
        ))}
      </div>
    </>
  );
}

function Backup() {
  const list = useApi<{ name: string; whose: string; bytes: number }[]>('/admin/backup/list');
  return (
    <>
      <div className="field">
        <h3>Back up the whole server</h3>
        <p>One archive with the server’s own database (people, sign-in, the tunnel) and every person’s library database (reviews, tags, collections, settings). Photographs are not in it: back those up the way you already do. Keys, secrets and sign-in sessions are taken out of every copy, so it is safe to keep.</p>
        <a className="pill primary" href="/api/admin/backup" download>Download a server backup</a>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Each person can also download their own library under Settings, Your data.</p>
      </div>
      <div className="field">
        <h3>Automatic backups</h3>
        <p>One a day for each library, the last seven kept, in each library’s <span className="mono">backups</span> directory in the data folder.</p>
        {list.data?.length === 0 && <p className="muted">None yet. The first is made shortly after start-up.</p>}
        {list.data?.map((b) => <div className="row" key={b.whose + b.name}><span><span className="mono">{b.name}</span> <span className="muted">{b.whose}</span></span><span className="faint">{(b.bytes / 1e6).toFixed(1)} MB</span></div>)}
      </div>
      <div className="field">
        <h3>Restore</h3>
        <p>Stop Frames, replace <span className="mono">system.db</span> and a library’s <span className="mono">frames.db</span> in the data folder (<span className="mono">users/&lt;number&gt;/</span> for everyone but the first administrator) with the copies from a backup, delete any <span className="mono">-wal</span> and <span className="mono">-shm</span> files next to them, and start Frames. A restored copy has no keys or sign-in sessions: enter the keys again and sign in.</p>
      </div>
    </>
  );
}

function About() {
  const h = useApi<{ version: string }>('/health');
  return <p className="empty">Frames {h.data ? (h.data.version === 'dev' ? '(development build)' : `version ${h.data.version}`) : ''}</p>;
}
