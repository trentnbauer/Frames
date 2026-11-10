import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Header, Img, Loading } from '../components/bits';
import { useStore, type Settings } from '../store';
import { PortfolioSettings } from './PortfolioSettings';
import { Access } from './Access';
import { AiSettings } from './AiSettings';
import { CloudServices, CloudSettings } from './CloudSettings';
import { TunnelSettings } from './TunnelSettings';
import { EnvExport } from './EnvExport';
import { People } from './People';
import { YourData } from './YourData';
import { Profile } from './Profile';
import { CloudOriginalsAdmin, CloudResolution, CommunitySettings, EmailSettings, NotificationSettings, ReportsQueue } from './SettingsExtra';
import { GearDefaults } from '../components/GearDefaults';

type Sec = 'Profile' | 'Notifications' | 'Email' | 'Reviews' | 'Tags & subjects' | 'Metadata & XMP' | 'AI' | 'Cloud sync' | 'Portfolio' | 'Your data'
  | 'Notifications' | 'Email' | 'People' | 'Access' | 'Libraries & storage' | 'Backup' | 'Env file' | 'Shared AI' | 'Cloud services' | 'Cloudflare tunnel' | 'About';

// One page. The first three groups are about your own library; the rest, shown only to administrators, are about the whole server.
const YOUR_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'You', items: ['Profile', 'Notifications'] },
  { title: 'Your library', items: ['Reviews', 'Tags & subjects', 'Metadata & XMP'] },
  { title: 'Connections', items: ['AI', 'Cloud sync', 'Portfolio'] },
  { title: 'Your account', items: ['Your data'] },
];
const ADMIN_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'People & sign-in', items: ['People', 'Access', 'Email'] },
  { title: 'Storage', items: ['Libraries & storage', 'Backup', 'Env file'] },
  { title: 'Shared services', items: ['Shared AI', 'Cloud services', 'Cloudflare tunnel'] },
];
/** What each section is called on screen (the others are called what they are named here). */
const LABEL: Partial<Record<Sec, string>> = { Access: 'Sign-in & access', 'Shared AI': 'AI for everyone', 'Cloud services': 'Cloud storage providers', AI: 'Your AI', 'Libraries & storage': 'Photo folders', About: 'About Frames' };
const DESC: Record<Sec, string> = {
  Profile: 'Your display name and picture, where you are, and the ways you can sign in as you.',
  Notifications: 'What the bell shows, what is emailed, and quiet hours.',
  Email: 'Outgoing mail, the sign-in code option and a log of what was sent.',
  Reviews: 'How often each photograph comes back for a rating.',
  'Tags & subjects': 'Create, rename, merge and delete your subjects and tags.',
  'Metadata & XMP': 'Sidecar files, other apps’ edits and exporting what you approved.',
  AI: 'The AI that describes and tags your own photographs.',
  'Cloud sync': 'Folders from your cloud accounts that Frames keeps in your library.',
  Portfolio: 'Your public site: which photos, how it looks and its address.',
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
  Profile: ['Display picture', 'Display name', 'Country', 'Seasons', 'Time zone', 'Signed in as', 'Ways to sign in as you'],
  Notifications: ['What you are told about', 'Review reminder', 'Quiet hours'],
  Email: ['Outgoing mail (SMTP)', 'Send a test email', 'Sign in with an emailed code', 'Email log'],
  Reviews: ['Sessions', 'Interval after each session', 'Adapt to consistency', 'Suggest leaving low-rated photos out of review'],
  'Tags & subjects': ['Subjects', 'Tags', 'Rename', 'Merge'],
  'Metadata & XMP': ['Camera defaults', 'Reading other apps’ edits', 'Write XMP next to my originals', 'Export approved metadata'],
  AI: ['Your AIs', 'Add an AI', 'Analysis'],
  'Cloud sync': ['Your connected folders', 'Connect an account', 'Dropbox', 'Google Drive', 'OneDrive'],
  Portfolio: ['Publish the portfolio', 'Which photos', 'The site', 'Its own web address', 'What a visitor gets when they open a photo'],
  'Your data': ['What is kept', 'Back up my data', 'Previews', 'Delete my data'],
  People: ['Add someone', 'Privacy page', 'Roles'],
  Access: ['Require sign-in', 'Providers', 'Who is allowed in', 'Public address'],
  'Libraries & storage': ['Photo libraries', 'Keep originals in cloud storage only', 'Always keep only a smaller copy of cloud photos'],
  Backup: ['Back up the whole server', 'Automatic backups', 'Restore'],
  'Env file': ['Download', 'Using it', 'Status'],
  'Shared AI': ['AIs for everyone on this server'],
  'Cloud services': ['Client ID', 'Client secret', 'Redirect address'],
  'Cloudflare tunnel': ['Run the tunnel', 'API token', 'Account ID', 'Addresses', 'App URL', 'Portfolios', 'Who can reach the App URL', 'Invitation only', 'Open to everyone', 'What Frames sets up', 'The tunnel log'],
};
const ALL: Sec[] = [...YOUR_GROUPS, ...ADMIN_GROUPS].flatMap((g) => g.items).concat('About');
const ADMIN_SET = new Set<Sec>(ADMIN_GROUPS.flatMap((g) => g.items));
const groupOf = (s: Sec) => [...YOUR_GROUPS, ...ADMIN_GROUPS].find((g) => g.items.includes(s))?.title;
const nameOf = (s: Sec) => LABEL[s] ?? s;
const slug = (s: Sec) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fromSlug = (v: string | null): Sec | null => (v === 'sign-in-methods' ? 'Profile' : ALL.find((s) => slug(s) === v) ?? null); // the old address of the sign-in methods page
const INTERVALS = ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'];

function Toggle({ on, onChange, label, hint, locked }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; locked?: string }) {
  return (
    <div className="field toggle">
      <div><h3 style={{ fontSize: 19 }}>{label}</h3>{hint && <p style={{ margin: 0 }}>{hint}</p>}{locked && <p className="reason" style={{ margin: '4px 0 0' }}>{locked}</p>}</div>
      <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} disabled={!!locked} onClick={() => onChange(!on)} />
    </div>
  );
}

export function SettingsPage() {
  const q0 = new URLSearchParams(window.location.search);
  // Coming back from a test sign-in or a cloud sign-in lands here with ?access=… or ?cloud=…, so open that section.
  const [sec, setSec] = useState<Sec>(() => fromSlug(q0.get('section')) ?? (q0.has('access') ? 'Access' : q0.has('cloud') ? 'Cloud sync' : 'Profile'));
  const [find, setFind] = useState('');
  const { settings: s, setSettings, me } = useStore();
  const isAdmin = me?.role === 'admin';
  const [err, setErr] = useState('');
  // Settings that can be refused (for example AI without a model) report why instead of failing silently.
  const save = async (p: Partial<Settings>) => { setErr(''); try { await setSettings(p); } catch (e) { setErr((e as Error).message); } };
  const go = (x: Sec) => { setSec(x); setErr(''); setFind(''); const u = new URL(window.location.href); u.searchParams.set('section', slug(x)); u.searchParams.delete('access'); u.searchParams.delete('cloud'); window.history.replaceState(null, '', u); };
  if (!s) return <div className="page"><Header /><Loading /></div>;
  const allowed = (x: Sec) => !ADMIN_SET.has(x) || isAdmin;
  const shown = allowed(sec) ? sec : 'Profile';
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
          {shown === 'Profile' && <Profile />}
          {shown === 'Notifications' && <NotificationSettings />}
          {shown === 'Email' && <EmailSettings />}
          {shown === 'Reviews' && <><Reviews s={s} save={save} /><CommunitySettings /></>}
          {shown === 'AI' && <AiSettings />}
          {shown === 'Shared AI' && <AiSettings server />}
          {shown === 'Libraries & storage' && <><Libraries /><CloudOriginalsAdmin /></>}
          {shown === 'Portfolio' && <PortfolioSettings />}
          {shown === 'Cloud sync' && <><CloudSettings /><CloudResolution /></>}
          {shown === 'Cloud services' && <CloudServices />}
          {shown === 'Cloudflare tunnel' && <TunnelSettings />}
          {shown === 'People' && <><People /><ReportsQueue /></>}
          {shown === 'Env file' && <EnvExport />}
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
      <DeleteSuggestions s={s} save={save} />
      <TodoReasons s={s} save={save} />
      <Toggle on={s.archiveSuggest} onChange={(v) => save({ archiveSuggest: v })} label="Suggest leaving low-rated photos out of review" hint="After 4 sessions averaging under 2. They stay in your library, search and compositions." />
    </>
  );
}

const TODO_REASONS: [string, string][] = [['camera', 'Camera specs'], ['location', 'Location'], ['time', 'Time'], ['subjects', 'Subjects'], ['tags', 'Tags'], ['description', 'Description'], ['composition', 'Not in a composition'], ['light', 'Light'], ['mood', 'Mood']];

/** Which missing things put a photograph on the To do list. Turning one off only hides it from that list. */
function TodoReasons({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const on = s.todoReasons ?? [];
  return (
    <div className="field">
      <h3>To do list</h3>
      <p>Choose what puts a photograph on your To do list. A reason you turn off is left out: a photograph with no camera set will not be listed if Camera specs is unticked.</p>
      <div className="form">
        {TODO_REASONS.map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={on.includes(k)} onChange={(e) => save({ todoReasons: e.target.checked ? [...on, k] : on.filter((x) => x !== k) })} /> {label}</label>
        ))}
      </div>
    </div>
  );
}

/** Suggest taking out photographs whose average rating, after every session, is below a line you choose. Nothing is removed until you tick and confirm. */
function DeleteSuggestions({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const list = useApi<{ below: number; sessions: number; photos: { id: number; title: string; avg: number; reviews: number }[] }>(`/photos/delete-suggestions?b=${s.deleteBelow}`);
  const [picked, setPicked] = useState<number[]>([]);
  const [msg, setMsg] = useState('');
  const n = list.data?.photos.length ?? 0;
  const take = async () => {
    if (!picked.length || !window.confirm(`Take ${picked.length} ${picked.length === 1 ? 'photograph' : 'photographs'} out of Frames?\n\nTheir reviews, tags and composition places go with them. Files in your library folders are not touched; copies Frames holds itself (uploads, cloud copies) are deleted. A scan will not bring them back.`)) return;
    try {
      const r = await api<{ removed: number; filesDeleted: number }>('/photos/remove', { body: { ids: picked } });
      setMsg(`Took ${r.removed} out of Frames${r.filesDeleted ? ` and deleted ${r.filesDeleted} of Frames’ own copies` : ''}.`);
      setPicked([]); list.reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="field">
      <h3>Suggest taking out low-rated photos</h3>
      <p>After a photograph has had all {s.sessions} of its sessions, suggest taking it out of Frames if its average is below a score you choose (2 unless you change it). Suggestions also appear on your To do list. Nothing is removed without you confirming.</p>
      <div className="form">
        <label>Suggest when the average is below{' '}
          <select aria-label="Suggest taking out below" value={s.deleteBelow} onChange={(e) => { setOpen(false); save({ deleteBelow: Number(e.target.value) }); }}>
            <option value={0}>Never</option>
            {[1.5, 2, 2.5, 3, 3.5, 4].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {s.deleteBelow > 0 && <button className="pill" disabled={n === 0} onClick={() => { setOpen(!open); setMsg(''); }}>{n === 0 ? 'Nothing suggested' : open ? 'Hide the suggestions' : `See ${n} suggested`}</button>}
      </div>
      {msg && <p role="status" className="muted" style={{ fontSize: 13 }}>{msg}</p>}
      {open && n > 0 && (
        <div style={{ marginTop: 12, maxWidth: 720 }}>
          <div className="row" style={{ gap: 12 }}>
            <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" aria-label="Tick all suggestions" checked={picked.length === n} onChange={(e) => setPicked(e.target.checked ? list.data!.photos.map((p) => p.id) : [])} /> Tick all</label>
            <button className="pill primary" disabled={!picked.length} onClick={take}>Take {picked.length || ''} out of Frames</button>
          </div>
          {list.data!.photos.map((p) => (
            <label className="row" key={p.id} style={{ gap: 12, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Take out ${p.title}`} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
              <span style={{ width: 64, height: 44, overflow: 'hidden', borderRadius: 6, background: 'var(--surface)', flex: 'none' }}><Img p={{ id: p.id, ar: 1.5 }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{p.title}</b> <Link to={`/photo/${p.id}`} className="t2" style={{ fontSize: 12, textDecoration: 'underline' }}>open</Link></span>
              <span className="faint">average {p.avg} over {p.reviews} sessions</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Libraries() {
  const info = useApi<{ internalDir: string; libraries: { path: string; exists: boolean; lastScan: string | null }[] }>('/settings');
  const inst = useApi<{ allowOriginals: boolean; cloudOnly: boolean; shrinkCopies: 'choice' | 'always' }>('/admin/instance');
  return (
    <>
      <Toggle on={!!inst.data?.cloudOnly} onChange={async (v) => {
        if (v && !window.confirm('Require originals to be kept in cloud storage?\n\nNobody will be able to upload photographs to Frames, and every cloud photograph will be kept only as a smaller copy here, with the full-size original left in the cloud.\n\nPhotographs already in Frames are not touched. IMPORTANT: anyone who deletes a photo from their cloud storage deletes its only full-size original.')) return;
        await api('/admin/instance', { method: 'PUT', body: { cloudOnly: v } }); inst.reload();
      }} label="Keep originals in cloud storage only" hint="Off by default. On: nobody can upload photographs to Frames, and every cloud photograph is kept only as a smaller copy (this includes “Always keep only a smaller copy of cloud photos” below). The full-size original stays in the person's cloud storage and is fetched when it is exported. Photographs already here, and library folders you mount, are not changed. Deleting a photo from cloud storage deletes its only full-size original." />
      <Toggle on={inst.data?.shrinkCopies === 'always' || !!inst.data?.cloudOnly} locked={inst.data?.cloudOnly ? 'Required while originals are kept in cloud storage only (above).' : undefined} onChange={async (v) => { if (v && !window.confirm('Require a smaller copy of every cloud photo, for everyone?\n\nFrames will keep only a JPEG at quality 80 of each photograph from every connected cloud folder, and leave the full-size originals in the cloud. Copies already held are made smaller on the next sync.\n\nIMPORTANT: anyone who deletes a photo from their cloud storage deletes its only full-size original.')) return; await api('/admin/instance', { method: 'PUT', body: { shrinkCopies: v ? 'always' : 'choice' } }); inst.reload(); }} label="Always keep only a smaller copy of cloud photos" hint="Off: each person chooses, per connected folder. On: required for everyone. Every cloud photo is kept as a JPEG at quality 80 and the full-size original stays in the cloud, fetched when it is exported. Deleting a photo from cloud storage deletes its only full-size original." />
      <Toggle on={!!inst.data?.allowOriginals} onChange={async (v) => { await api('/admin/instance', { method: 'PUT', body: { allowOriginals: v } }); inst.reload(); }} label="Let portfolios offer original files" hint="Off by default. When on, a person can choose to let visitors of their portfolio download the original file, which can hold camera data and the place a photo was taken. When off, portfolios only serve resized copies." />
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
      <div className="field">
        <h3>Camera defaults</h3>
        <p>Camera details for every new photograph whose file has none: a film camera and stock, say. They only fill blanks. What the file says, and anything you type on a photograph, is never replaced, and a photoshoot can have its own defaults, which win over these. Photographs already here are not changed.</p>
        <GearDefaults label="Camera defaults" value={s.gear} onSave={(gear) => save({ gear })} />
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

type RestoreInfo = { dir: string; archives: { name: string; bytes: number; at: string }[]; pending: { at: string; parts: string[] } | null; canRestart: boolean };

/** Restoring the people and libraries from a server backup. It is checked and put aside, and applied when Frames next starts. */
function Restore() {
  const r = useApi<RestoreInfo>('/admin/restore');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const s3list = useApi<{ name: string; bytes: number }[]>('/admin/backup/remote?from=s3');
  const cloudlist = useApi<{ name: string; bytes: number }[]>('/admin/backup/remote?from=cloud');
  const done = (x: { parts: string[]; people: number }) => { setMsg({ ok: true, text: `Checked: ${x.people} ${x.people === 1 ? 'person' : 'people'} and ${x.parts.length - 1} ${x.parts.length === 2 ? 'library' : 'libraries'}. It is applied the next time Frames starts.` }); r.reload(); };
  const run = async (fn: () => Promise<{ parts: string[]; people: number }>) => { setMsg(null); setBusy(true); try { done(await fn()); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };
  const upload = async (f: File) => {
    const body = new FormData(); body.append('file', f);
    const res = await fetch('/api/admin/restore/upload', { method: 'POST', body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? 'That did not work.');
    return j;
  };
  const restart = async () => { setMsg(null); try { await api('/admin/restart', { method: 'POST' }); setMsg({ ok: true, text: 'Restarting. Reload this page in a few seconds and sign in again.' }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };
  return (
    <div className="field">
      <h3>Restore</h3>
      <p>Put the people and libraries from a server backup back: reviews, tags, compositions and each person’s own settings. The server’s own settings (sign-in providers, the tunnel, shared AIs and keys) are <b>not</b> in a backup and <b>not</b> changed: they come from your env file (Settings, Env file) or what is set here now. Photographs are not touched. Everyone is signed out and signs in again, and the databases being replaced are kept in <span className="mono">backups/before-restore-…</span> in the data folder.</p>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {r.data?.pending && (
        <div className="banner" role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>A restore is ready ({r.data.pending.parts.length - 1} {r.data.pending.parts.length === 2 ? 'library' : 'libraries'}). Frames applies it when it next starts.</span>
          {r.data.canRestart && <button className="pill primary" onClick={() => { if (window.confirm('Restart Frames now and apply the restore? Everyone is signed out.')) void restart(); }}>Restart Frames now</button>}
          <button className="pill" onClick={async () => { await api('/admin/restore', { method: 'DELETE' }); setMsg(null); r.reload(); }}>Cancel the restore</button>
        </div>
      )}
      <div className="form">
        <input ref={file} type="file" accept=".tar,application/x-tar" aria-label="Choose a server backup file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => upload(f)); }} />
        <button className="pill" disabled={busy} onClick={() => file.current?.click()}>Restore from a file…</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>A file you downloaded above. Or put it in <span className="mono">{r.data?.dir ?? 'the backups folder'}</span> and pick it here:</p>
      {r.data?.archives.length === 0 && <p className="muted">No server backups in that folder yet. One is made a day (the last seven kept).</p>}
      {([['s3', 'In your S3 bucket', s3list], ['cloud', 'In your cloud account', cloudlist]] as const).map(([from, label, l]) => (
        <div key={from}>
          {l.data && l.data.length > 0 && <p className="muted" style={{ fontSize: 12.5 }}>{label}:</p>}
          {l.data?.map((a) => (
            <div className="row" key={`${from}-${a.name}`}>
              <span><span className="mono">{a.name}</span> <span className="faint">{(a.bytes / 1e6).toFixed(1)} MB</span></span>
              <button className="pill" disabled={busy} onClick={() => { if (window.confirm(`Restore from ${a.name} (${label.toLowerCase()})? It is downloaded and checked first, and applied the next time Frames starts.`)) void run(async () => { const x = await api<{ parts: string[]; people: number }>('/admin/backup/remote/restore', { body: { from, name: a.name } }); r.reload(); return x; }); }}>Restore</button>
            </div>
          ))}
        </div>
      ))}
      {r.data?.archives.map((a) => (
        <div className="row" key={a.name}>
          <span><span className="mono">{a.name}</span> <span className="faint">{(a.bytes / 1e6).toFixed(1)} MB</span></span>
          <button className="pill" disabled={busy} onClick={() => { if (window.confirm(`Restore from ${a.name}? It is checked first and applied the next time Frames starts.`)) void run(() => api('/admin/restore', { body: { name: a.name } })); }}>Restore this</button>
        </div>
      ))}
    </div>
  );
}

type S3State = { configured: boolean; endpoint: string; region: string; bucket: string; prefix: string; accessKeyId: string; hasSecret: boolean; status: { at: string; ok: boolean; message: string } | null };

/** Copy the daily whole-server archive to S3 or an S3-compatible service. The secret key is write-only: it is never shown again. */
function S3Backup() {
  const st = useApi<S3State>('/admin/backup/s3');
  const [f, setF] = useState({ endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (st.data) setF((x) => ({ ...x, endpoint: st.data!.endpoint, region: st.data!.region, bucket: st.data!.bucket, prefix: st.data!.prefix, accessKeyId: st.data!.accessKeyId })); }, [st.data?.endpoint, st.data?.bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<string>) => { setMsg(null); setBusy(true); try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); st.reload(); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="field">
      <h3>Back up to S3</h3>
      <p>Copy the daily whole-server archive to Amazon S3, or a service that speaks the same language (MinIO, Backblaze B2, Wasabi). The last seven are kept there. Use a key that may only write to this bucket. The secret key is stored on this server, never shown again, and left out of backups.</p>
      <div className="form">
        <label>Endpoint <input value={f.endpoint} onChange={set('endpoint')} placeholder="https://s3.us-east-1.amazonaws.com" aria-label="S3 endpoint" /></label>
        <label>Region <input value={f.region} onChange={set('region')} placeholder="us-east-1" aria-label="S3 region" /></label>
        <label>Bucket <input value={f.bucket} onChange={set('bucket')} aria-label="S3 bucket" /></label>
        <label>Folder in the bucket (optional) <input value={f.prefix} onChange={set('prefix')} placeholder="frames" aria-label="S3 folder" /></label>
        <label>Access key <input value={f.accessKeyId} onChange={set('accessKeyId')} autoComplete="off" aria-label="S3 access key" /></label>
        <label>Secret key <input type="password" value={f.secretAccessKey} onChange={set('secretAccessKey')} autoComplete="off" placeholder={st.data?.hasSecret ? 'Saved. Type to replace' : ''} aria-label="S3 secret key" /></label>
      </div>
      <div className="form">
        <button className="pill primary" disabled={busy} onClick={() => void act(async () => { await api('/admin/backup/s3', { method: 'PUT', body: f }); setF((x) => ({ ...x, secretAccessKey: '' })); return 'Saved.'; })}>Save</button>
        {st.data?.configured && <button className="pill" disabled={busy} onClick={() => void act(async () => { const r = await api<{ uploaded: string[] }>('/admin/backup/sync', { body: {} }); return r.uploaded.length ? `Uploaded ${r.uploaded.join(', ')}.` : 'Already up to date.'; })}>Back up now</button>}
        {st.data?.configured && <button className="pill" disabled={busy} onClick={() => { if (window.confirm('Stop backing up to S3? Copies already in the bucket stay there.')) void act(async () => { await api('/admin/backup/s3', { method: 'DELETE' }); setF({ endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '' }); return 'S3 backups are off.'; }); }}>Turn off</button>}
      </div>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {st.data?.status && <p className="muted" style={{ fontSize: 12.5 }}>Last attempt {fmtDate(st.data.status.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: {st.data.status.ok ? st.data.status.message : <span className="reason">{st.data.status.message}</span>}</p>}
      <p className="muted" style={{ fontSize: 12.5 }}>Backups in the bucket are listed under Restore below. Not tested against the real services.</p>
    </div>
  );
}

type CloudBackupState = { connected: boolean; provider: string; account: string; status: { at: string; ok: boolean; message: string } | null };
const PROVIDER_NAMES: Record<string, string> = { dropbox: 'Dropbox', google: 'Google Drive', onedrive: 'OneDrive' };

/** Copy the daily archive to the administrator's own Dropbox, Google Drive or OneDrive, in a folder called Frames backups. */
function CloudBackup() {
  const st = useApi<CloudBackupState>('/admin/backup/cloud');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => { const b = new URLSearchParams(window.location.search).get('backup'); return b ? { ok: b === 'connected', text: b === 'connected' ? 'Connected.' : b } : null; });
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string>) => { setMsg(null); setBusy(true); try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); st.reload(); };
  const connect = (p: string) => act(async () => { const r = await api<{ url: string }>(`/admin/backup/cloud/connect/${p}`, { body: {} }); window.location.href = r.url; return 'Opening the sign-in…'; });
  return (
    <div className="field">
      <h3>Back up to Dropbox, Google Drive or OneDrive</h3>
      <p>Copy the daily whole-server archive to your own cloud account, into a folder called <span className="mono">Frames backups</span> that Frames makes. The last seven are kept. This is a separate sign-in for backups, with permission to write to that folder only where the service allows it (the connections used to read photographs never get write access). The service must first be set up under Settings, Cloud services, and its app registration must allow writing files.</p>
      {st.data?.connected ? (
        <div className="form">
          <span>Connected to {PROVIDER_NAMES[st.data.provider] ?? st.data.provider}{st.data.account ? `, ${st.data.account}` : ''}.</span>
          <button className="pill" disabled={busy} onClick={() => void act(async () => { const r = await api<{ uploaded: string[] }>('/admin/backup/sync', { body: {} }); return r.uploaded.length ? `Uploaded ${r.uploaded.join(', ')}.` : 'Already up to date.'; })}>Back up now</button>
          <button className="pill" disabled={busy} onClick={() => { if (window.confirm('Stop backing up to this account? Copies already there stay there.')) void act(async () => { await api('/admin/backup/cloud', { method: 'DELETE' }); return 'Disconnected.'; }); }}>Disconnect</button>
        </div>
      ) : (
        <div className="form">{Object.entries(PROVIDER_NAMES).map(([id, label]) => <button key={id} className="pill" disabled={busy} onClick={() => void connect(id)}>Connect {label}</button>)}</div>
      )}
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {st.data?.status && <p className="muted" style={{ fontSize: 12.5 }}>Last attempt {fmtDate(st.data.status.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: {st.data.status.ok ? st.data.status.message : <span className="reason">{st.data.status.message}</span>}</p>}
      <p className="muted" style={{ fontSize: 12.5 }}>Not tested against the real services. A backup over 140 MB is refused for Dropbox: use S3 for archives that big.</p>
    </div>
  );
}

function Backup() {
  const list = useApi<{ name: string; whose: string; bytes: number }[]>('/admin/backup/list');
  return (
    <>
      <div className="field">
        <h3>Back up the whole server</h3>
        <p>One archive with the people (who has an account, their roles and folders) and every person’s library database (reviews, tags, compositions, settings). Photographs are not in it: back those up the way you already do. The server’s own settings (sign-in providers, the tunnel, shared AIs and keys) are left out, as are sign-in sessions: they belong in your env file, so a backup holds user data only.</p>
        <a className="pill primary" href="/api/admin/backup" download>Download a server backup</a>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Each person can also download their own library under Settings, Your data.</p>
      </div>
      <div className="field">
        <h3>Automatic backups</h3>
        <p>One a day for each library, the last seven kept, in each library’s <span className="mono">backups</span> directory in the data folder. Also one whole-server archive a day (the last seven kept) in the backups folder, which is the <span className="mono">/backups</span> mount in the compose file.</p>
        {list.data?.length === 0 && <p className="muted">None yet. The first is made shortly after start-up.</p>}
        {list.data?.map((b) => <div className="row" key={b.whose + b.name}><span><span className="mono">{b.name}</span> <span className="muted">{b.whose}</span></span><span className="faint">{(b.bytes / 1e6).toFixed(1)} MB</span></div>)}
      </div>
      <S3Backup />
      <CloudBackup />
      <Restore />
    </>
  );
}

function About() {
  const h = useApi<{ version: string }>('/health');
  return (
    <>
      <p className="empty">Frames {h.data ? (h.data.version === 'dev' ? '(development build)' : `version ${h.data.version}`) : ''}</p>
      <div className="field"><h3>The welcome tour</h3><p>A short tour of bringing photographs in, photoshoots and compositions, reviewing and sharing.</p><Link to="/welcome" className="pill">Show the welcome tour</Link></div>
    </>
  );
}

