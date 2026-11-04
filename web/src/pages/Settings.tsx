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

type Sec = 'Reviews' | 'Tags & subjects' | 'Metadata & XMP' | 'AI' | 'Cloud sync' | 'Portfolio' | 'Sign-in methods' | 'Your data'
  | 'People' | 'Access' | 'Libraries & storage' | 'Backup' | 'Env file' | 'Shared AI' | 'Cloud services' | 'Cloudflare tunnel' | 'About';

// One page. The first three groups are about your own library; the rest, shown only to administrators, are about the whole server.
const YOUR_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'Your library', items: ['Reviews', 'Tags & subjects', 'Metadata & XMP'] },
  { title: 'Connections', items: ['AI', 'Cloud sync', 'Portfolio'] },
  { title: 'Your account', items: ['Sign-in methods', 'Your data'] },
];
const ADMIN_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'People & sign-in', items: ['People', 'Access'] },
  { title: 'Storage', items: ['Libraries & storage', 'Backup', 'Env file'] },
  { title: 'Shared services', items: ['Shared AI', 'Cloud services', 'Cloudflare tunnel'] },
];
/** What each section is called on screen (the others are called what they are named here). */
const LABEL: Partial<Record<Sec, string>> = { Access: 'Sign-in & access', 'Shared AI': 'AI for everyone', 'Cloud services': 'Cloud storage providers', AI: 'Your AI', 'Libraries & storage': 'Photo folders', About: 'About Frames' };
const DESC: Record<Sec, string> = {
  Reviews: 'How often each photograph comes back for a rating.',
  'Tags & subjects': 'Create, rename, merge and delete your subjects and tags.',
  'Metadata & XMP': 'Sidecar files, other apps’ edits and exporting what you approved.',
  AI: 'The AI that describes and tags your own photographs.',
  'Cloud sync': 'Folders from your cloud accounts that Frames keeps in your library.'.replace('Frames', 'Frames'),
  Portfolio: 'Your public site: which photos, how it looks and its address.',
  'Sign-in methods': 'The account you are signed in to Frames with.',
  'Your data': 'What Frames keeps about your library, and how to back it up or delete it.',
  People: 'Who has a library on this server, and the privacy page they see.',
  Access: 'Whether sign-in is required, which providers are offered and who is allowed in.',
  'Libraries & storage': 'The folders Frames reads photographs from.',
  Backup: 'Download a server backup, see the automatic ones, and how to restore.',
  'Env file': 'Keep the server’s settings in an env file so they survive a restart.',
  'Shared AI': 'AIs everyone on this server can use without their own key.',
  'Cloud services': 'The cloud accounts people can connect for Cloud sync.',
  'Cloudflare tunnel': 'Reach Frames from outside your network without opening ports.',
  About: 'Version and what’s new.',
};
/** The headings inside each section, so the finder can find a setting and not only a section. */
const HEADINGS: Partial<Record<Sec, string[]>> = {
  Reviews: ['Sessions', 'Interval after each session', 'Adapt to consistency', 'Suggest leaving low-rated photos out of review'],
  'Tags & subjects': ['Subjects', 'Tags', 'Rename', 'Merge'],
  'Metadata & XMP': ['Reading other apps’ edits', 'Write XMP next to my originals', 'Export approved metadata'],
  AI: ['Your AIs', 'Add an AI', 'Analysis'],
  'Cloud sync': ['Your connected folders', 'Connect an account', 'Dropbox', 'Google Drive', 'OneDrive'],
  Portfolio: ['Publish the portfolio', 'Which photos', 'The site', 'Its own web address', 'What a visitor gets when they open a photo'],
  'Sign-in methods': ['Signed in as'],
  'Your data': ['What is kept', 'Back up my data', 'Previews', 'Delete my data'],
  People: ['Add someone', 'Privacy page', 'Roles'],
  Access: ['Require sign-in', 'Providers', 'Who is allowed in', 'Public address'],
  'Libraries & storage': ['Photo libraries'],
  Backup: ['Back up the whole server', 'Automatic backups', 'Restore'],
  'Env file': ['Download', 'Using it', 'Status'],
  'Shared AI': ['AIs for everyone on this server'],
  'Cloud services': ['Client ID', 'Client secret', 'Redirect address'],
  'Cloudflare tunnel': ['Run the tunnel', 'API token', 'Account ID', 'Addresses', 'App URL', 'Portfolios', 'Protect the App URL with Cloudflare Access', 'What Frames sets up', 'The tunnel log'],
};
const ALL: Sec[] = [...YOUR_GROUPS, ...ADMIN_GROUPS].flatMap((g) => g.items).concat('About');
const ADMIN_SET = new Set<Sec>(ADMIN_GROUPS.flatMap((g) => g.items));
const groupOf = (s: Sec) => [...YOUR_GROUPS, ...ADMIN_GROUPS].find((g) => g.items.includes(s))?.title;
const nameOf = (s: Sec) => LABEL[s] ?? s;
const slug = (s: Sec) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fromSlug = (v: string | null): Sec | null => ALL.find((s) => slug(s) === v) ?? null;
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
  const q0 = new URLSearchParams(window.location.search);
  // Coming back from a test sign-in or a cloud sign-in lands here with ?access=… or ?cloud=…, so open that section.
  const [sec, setSec] = useState<Sec>(() => fromSlug(q0.get('section')) ?? (q0.has('access') ? 'Access' : q0.has('cloud') ? 'Cloud sync' : 'Reviews'));
  const [find, setFind] = useState('');
  const { settings: s, setSettings, me } = useStore();
  const isAdmin = me?.role === 'admin';
  const [err, setErr] = useState('');
  // Settings that can be refused (for example AI without a model) report why instead of failing silently.
  const save = async (p: Partial<Settings>) => { setErr(''); try { await setSettings(p); } catch (e) { setErr((e as Error).message); } };
  const go = (x: Sec) => { setSec(x); setErr(''); setFind(''); const u = new URL(window.location.href); u.searchParams.set('section', slug(x)); u.searchParams.delete('access'); u.searchParams.delete('cloud'); window.history.replaceState(null, '', u); };
  if (!s) return <div className="page"><Header /><Loading /></div>;
  const allowed = (x: Sec) => !ADMIN_SET.has(x) || isAdmin;
  const shown = allowed(sec) ? sec : 'Reviews';
  const needle = find.trim().toLowerCase();
  const results = needle
    ? ALL.filter(allowed).flatMap((x) => {
        const hit = (HEADINGS[x] ?? []).find((h) => h.toLowerCase().includes(needle));
        return nameOf(x).toLowerCase().includes(needle) || x.toLowerCase().includes(needle) || hit ? [{ x, sub: hit ?? (ADMIN_SET.has(x) ? `Administration · ${groupOf(x)}` : groupOf(x) ?? 'Frames') }] : [];
      })
    : [];
  const item = (x: Sec) => <button key={x} className={shown === x ? 'on' : ''} onClick={() => go(x)}>{nameOf(x)}</button>;
  const label = (t: string) => <div className="faint" style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', margin: '14px 0 4px 12px' }}>{t}</div>;
  const adminSec = ADMIN_SET.has(shown);
  return (
    <div className="page">
      <Header />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 56, alignItems: 'flex-start' }}>
        <aside style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', position: 'sticky', top: 24 }}>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a setting" aria-label="Find a setting" style={{ background: 'var(--surface)', border: 0, borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', marginBottom: 6 }} />
          {needle ? (
            <div className="snav" role="list" aria-label="Matching settings" style={{ marginTop: 8 }}>
              {results.map((r) => (
                <button key={r.x} role="listitem" onClick={() => go(r.x)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, color: 'var(--text)' }}>{nameOf(r.x)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{r.sub}</span>
                </button>
              ))}
              {results.length === 0 && <div className="muted" style={{ padding: '8px 12px', fontSize: 13 }}>Nothing matches.</div>}
            </div>
          ) : (
            <nav className="snav" aria-label="Settings sections">
              {YOUR_GROUPS.map((g) => <div key={g.title} role="group" aria-label={g.title} style={{ display: 'contents' }}>{label(g.title)}{g.items.map(item)}</div>)}
              {isAdmin && (
                <div style={{ marginTop: 22, paddingTop: 6, borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', margin: '14px 12px 2px' }}>Administration</div>
                  <div className="faint" style={{ fontSize: 12, margin: '0 12px 4px' }}>Applies to everyone on this server</div>
                  {ADMIN_GROUPS.map((g) => <div key={g.title} role="group" aria-label={g.title} style={{ display: 'contents' }}>{label(g.title)}{g.items.map(item)}</div>)}
                </div>
              )}
              <div style={{ marginTop: 22, paddingTop: 10, borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column' }}>
                <button className={shown === 'About' ? 'on' : ''} style={{ fontSize: 13, color: shown === 'About' ? undefined : 'var(--muted)' }} onClick={() => go('About')}>About Frames</button>
              </div>
            </nav>
          )}
        </aside>
        <main style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div className="faint" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{adminSec ? `Settings · Administration · ${groupOf(shown)}` : shown === 'About' ? 'Settings' : `Settings · ${groupOf(shown)}`}</div>
          <h1 className="serif" style={{ fontSize: 44, lineHeight: 1, margin: '10px 0' }}>{nameOf(shown)}</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', maxWidth: 640 }}>{DESC[shown]}</p>
          {adminSec && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '5px 11px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)' }} />
              Administrator setting · changes affect every person
            </div>
          )}
          <div style={{ height: 12 }} />
          {me?.envConfig && shown !== 'Env file' && <div className="banner" role="status"><span>Settings were loaded from your env file when Frames started, and it wins over the app: changes made here last until the next restart. See Env file to keep them.</span></div>}
          {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
          {shown === 'Reviews' && <Reviews s={s} save={save} />}
          {shown === 'AI' && <AiSettings />}
          {shown === 'Shared AI' && <AiSettings server />}
          {shown === 'Libraries & storage' && <Libraries />}
          {shown === 'Portfolio' && <PortfolioSettings />}
          {shown === 'Cloud sync' && <CloudSettings />}
          {shown === 'Cloud services' && <CloudServices />}
          {shown === 'Cloudflare tunnel' && <TunnelSettings />}
          {shown === 'People' && <People />}
          {shown === 'Env file' && <EnvExport />}
          {shown === 'Sign-in methods' && <SignInMethods />}
          {shown === 'Your data' && <YourData />}
          {shown === 'Access' && <Access />}
          {shown === 'Tags & subjects' && <Vocabulary />}
          {shown === 'Metadata & XMP' && <Metadata s={s} save={save} />}
          {shown === 'Backup' && <Backup />}
          {shown === 'About' && <About />}
        </main>
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

/** Who you are signed in as, and with what. */
function SignInMethods() {
  const { me } = useStore();
  return (
    <div className="field">
      <h3>Signed in as</h3>
      {me?.user
        ? <>
            <div className="row"><span><b>{me.user.name || me.user.email}</b> <span className="muted">{me.user.email}</span></span><span className="faint">signed in with {me.user.provider} · {me.role === 'admin' ? 'administrator' : 'member'}</span></div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Your library folder is <span className="mono">{me.user.folder || 'the main folder'}</span>. The administrator decides which ways of signing in are offered, under Sign-in &amp; access.</p>
          </>
        : <p className="muted">Sign-in is off on this server, so there is no account to show: everyone who can reach Frames uses it as its owner.</p>}
    </div>
  );
}
