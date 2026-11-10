import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Header, Img, Loading } from '../components/bits';
import { useStore, type Settings } from '../store';
import { PortfolioSettings } from './PortfolioSettings';
import { Access } from './Access';
import { AiSettings } from './AiSettings';
import { CloudSettings } from './CloudSettings';
import { BackupSection, PhotosStorage, StorageProcessing, UpdatesSystem } from './ServerSettings';
import { Notice } from '../components/srow';
import { TunnelSettings } from './TunnelSettings';
import { People } from './People';
import { YourData } from './YourData';
import { Profile } from './Profile';
import { AiJobs, CloudOriginalsAdmin, XmpLocationAdmin, CloudResolution, CommunitySettings, EmailSettings, NotificationSettings, ReportsQueue } from './SettingsExtra';
import { GearDefaults } from '../components/GearDefaults';

type Sec = 'Profile' | 'Notifications' | 'Email' | 'Reviews' | 'Tags & subjects' | 'Metadata & XMP' | 'AI' | 'Cloud sync' | 'Portfolio' | 'Your data'
  | 'Notifications' | 'Email' | 'People' | 'Access' | 'Photos & storage' | 'Backup' | 'Shared AI' | 'Cloudflare tunnel' | 'Storage & processing' | 'Updates & system' | 'About';

// One page. The first three groups are about your own library; the rest, shown only to administrators, are about the whole server.
const YOUR_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'You', items: ['Profile', 'Notifications'] },
  { title: 'Your library', items: ['Reviews', 'Tags & subjects', 'Metadata & XMP'] },
  { title: 'Connections', items: ['AI', 'Cloud sync', 'Portfolio'] },
  { title: 'Your account', items: ['Your data'] },
];
const ADMIN_GROUPS: { title: string; items: Sec[] }[] = [
  { title: 'Server', items: ['Access', 'People', 'Photos & storage', 'Backup', 'Shared AI', 'Cloudflare tunnel', 'Email', 'Storage & processing', 'Updates & system'] },
];
/** What each section is called on screen (the others are called what they are named here). */
const LABEL: Partial<Record<Sec, string>> = { Access: 'Sign-in & access', People: 'Members', 'Shared AI': 'AI', AI: 'Your AI', About: 'About Frames' };
const DESC: Record<Sec, string> = {
  Profile: 'Your display name and picture, where you are, and the ways you can sign in as you.',
  Notifications: 'What the bell shows, what is emailed, and quiet hours.',
  'Email': 'For invites, guest replies and password-free sign-in.',
  Reviews: 'How often each photograph comes back for a rating.',
  'Tags & subjects': 'Create, rename, merge and delete your subjects and tags.',
  'Metadata & XMP': 'Sidecar files, other apps’ edits and exporting what you approved.',
  AI: 'The AI that describes and tags your own photographs.',
  'Cloud sync': 'Folders from your cloud accounts that Frames keeps in your library.',
  Portfolio: 'Your public site: which photos, how it looks and its address.',
  'Your data': 'What Frames keeps about your library, and how to back it up or delete it.',
  'People': 'Who can sign in to this Frames.',
  'Access': 'How people get in.',
  'Photos & storage': 'Where originals live, and the cloud services members can bring photos in from.',
  'Storage & processing': 'Thumbnails, previews and background work.',
  'Updates & system': 'Version, logs and maintenance.',
  'Backup': 'Ratings, tags and compositions. Not the photos.',
  'Shared AI': 'AI providers everyone on this server can use.',
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
  People: ['Add someone', 'Storage used', 'Privacy page', 'Roles'],
  Access: ['Sign-in methods', 'Sessions', 'Require sign-in', 'Allow anyone to sign up', 'Stay signed in for', 'Guest links', 'Expire after', 'Guests can download files', 'Ask guests for their name', 'Bot check', 'Who is allowed in', 'Public address'],
  'Photos & storage': ['Library folders', 'XMP sidecars', 'Where sidecar files go', 'Originals', 'Allow original downloads on portfolios', 'Allow original resolution from the cloud', 'Keep originals in cloud storage only', 'Cloud providers', 'Client ID', 'Client secret', 'Redirect address'],
  Backup: ['Back up automatically', 'Every', 'Keep the last', 'History', 'Restore', 'S3', 'Dropbox'],
  'Shared AI': ['AIs for everyone on this server'],
  'Storage & processing': ['Cache folder', 'Cache size', 'Rescan library folder', 'Rebuild thumbnails'],
  'Updates & system': ['Version', 'Check now', 'Health', 'Restart Frames', 'Environment file', 'Export settings as .env'],
  'Cloudflare tunnel': ['Run the tunnel', 'API token', 'Account ID', 'Addresses', 'App URL', 'Portfolios', 'Who can reach the App URL', 'Invitation only', 'Open to everyone', 'What Frames sets up', 'The tunnel log']
};
const ALL: Sec[] = [...YOUR_GROUPS, ...ADMIN_GROUPS].flatMap((g) => g.items).concat('About');
const ADMIN_SET = new Set<Sec>(ADMIN_GROUPS.flatMap((g) => g.items));
const groupOf = (s: Sec) => [...YOUR_GROUPS, ...ADMIN_GROUPS].find((g) => g.items.includes(s))?.title;
const nameOf = (s: Sec) => LABEL[s] ?? s;
const slug = (s: Sec) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const OLD: Record<string, Sec> = { 'sign-in-methods': 'Profile', 'libraries-storage': 'Photos & storage', 'cloud-services': 'Photos & storage', 'env-file': 'Updates & system', 'members': 'People', 'sign-in-access': 'Access' };
const fromSlug = (v: string | null): Sec | null => (v ? OLD[v] ?? ALL.find((s) => slug(s) === v) ?? null : null); // the old address of the sign-in methods page
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
  const [headAction, setHeadAction] = useState<React.ReactNode>(null);
  const invite = useRef<(() => void) | null>(null);
  const onInvite = (open: () => void) => { invite.current = open; };
  // Settings that can be refused (for example AI without a model) report why instead of failing silently.
  const save = async (p: Partial<Settings>) => { setErr(''); try { await setSettings(p); } catch (e) { setErr((e as Error).message); } };
  const go = (x: Sec) => { setHeadAction(null); setSec(x); setErr(''); setFind(''); const u = new URL(window.location.href); u.searchParams.set('section', slug(x)); u.searchParams.delete('access'); u.searchParams.delete('cloud'); window.history.replaceState(null, '', u); };
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
      <div className="spread" style={{ alignItems: 'center', marginBottom: 32 }}>
        <h1 className="serif" style={{ fontSize: 48, lineHeight: 1 }}>Settings</h1>
        {isAdmin && (
          <div role="tablist" aria-label="Scope" style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 999, background: 'var(--surface)' }}>
            <button role="tab" aria-selected={!adminSec} onClick={() => adminSec && go('Profile')} style={{ padding: '8px 16px', borderRadius: 999, fontSize: 14, background: !adminSec ? 'var(--chip)' : 'transparent', color: !adminSec ? 'var(--text)' : 'var(--text2)' }}>Your library</button>
            <button role="tab" aria-selected={adminSec} onClick={() => !adminSec && go('People')} style={{ padding: '8px 16px', borderRadius: 999, fontSize: 14, background: adminSec ? 'var(--chip)' : 'transparent', color: adminSec ? 'var(--text)' : 'var(--text2)' }}>Server <span className="faint">· admin</span></button>
          </div>
        )}
      </div>
      <div className="settings-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 56, alignItems: 'flex-start' }}>
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
              {(adminSec ? ADMIN_GROUPS : YOUR_GROUPS).map((g) => <div key={g.title} role="group" aria-label={g.title} style={{ display: 'contents' }}>{g.items.map(item)}</div>)}
              <div style={{ marginTop: 22, paddingTop: 10, borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column' }}>
                <button className={shown === 'About' ? 'on' : ''} style={{ fontSize: 13, color: shown === 'About' ? undefined : 'var(--muted)' }} onClick={() => go('About')}>About Frames</button>
              </div>
            </nav>
          )}
        </aside>
        <main className="settings-main" style={{ flex: '1 1 480px', minWidth: 0, maxWidth: 760 }}>
          <div className="shead">
            <div>
              <h2 className="serif" style={{ fontSize: 40, lineHeight: 1, margin: '0 0 8px' }}>{nameOf(shown)}</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', maxWidth: 640 }}>{DESC[shown]}</p>
            </div>
            {adminSec && shown === 'People' && <button className="pill primary" onClick={() => invite.current?.()}>+ Invite</button>}
            {adminSec && shown === 'Backup' && headAction}
          </div>
          {adminSec && <Notice />}
          <div style={{ height: 12 }} />
          {me?.envConfig && shown !== 'Updates & system' && <div className="banner" role="status"><span>Settings were loaded from your env file when Frames started, and it wins over the app: changes made here last until the next restart. See Updates & system to keep them.</span></div>}
          {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
          {shown === 'Profile' && <Profile />}
          {shown === 'Notifications' && <NotificationSettings />}
          {shown === 'Email' && <EmailSettings />}
          {shown === 'Reviews' && <Reviews s={s} save={save} />}
          {shown === 'AI' && <><AiSettings /><AiJobs /></>}
          {shown === 'Shared AI' && <AiSettings server />}
          {shown === 'Photos & storage' && <PhotosStorage />}
          {shown === 'Storage & processing' && <StorageProcessing />}
          {shown === 'Updates & system' && <UpdatesSystem />}
          {shown === 'Portfolio' && <PortfolioSettings />}
          {shown === 'Cloud sync' && <><CloudSettings /><CloudResolution /></>}
          {shown === 'Cloudflare tunnel' && <TunnelSettings />}
          {shown === 'People' && <><People onInvite={onInvite} /><ReportsQueue /></>}
          {shown === 'Your data' && <YourData />}
          {shown === 'Access' && <Access />}
          {shown === 'Tags & subjects' && <Vocabulary />}
          {shown === 'Metadata & XMP' && <Metadata s={s} save={save} />}
          {shown === 'Backup' && <BackupSection registerAction={setHeadAction} />}
          {shown === 'About' && <About />}
        </main>
      </div>
    </div>
  );
}

function Reviews({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const w = useApi<{ weight: number }>('/collections/guest-weight');
  const row = (title: string, hint: string | undefined, control: React.ReactNode, last = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '14px 0', borderBottom: last ? 0 : '1px solid var(--hair)' }}>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>{title}</div>{hint && <div className="muted" style={{ fontSize: 12.5, maxWidth: 320 }}>{hint}</div>}</div>{control}
    </div>
  );
  const stepper = (v: number, set: (n: number) => void, min: number, max: number, label: string) => (
    <div className="stepper" role="group" aria-label={label}><button aria-label={`Fewer ${label}`} onClick={() => set(Math.max(min, v - 1))}>−</button><b>{v}</b><button aria-label={`More ${label}`} onClick={() => set(Math.min(max, v + 1))}>+</button></div>
  );
  const sw = (on: boolean, set: (v: boolean) => void, label: string) => <button role="switch" aria-checked={on} aria-label={label} className={'sw' + (on ? ' on' : '')} onClick={() => set(!on)} />;
  const seg = <T extends string | number>(opts: [T, string][], value: T, set: (v: T) => void, label: string) => <div className="seg" role="group" aria-label={label} style={{ alignSelf: 'auto' }}>{opts.map(([k, l]) => <button key={String(k)} aria-pressed={value === k} className={value === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
  const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: 14, padding: '2px 24px', marginBottom: 8 };
  const group = (t: string) => <div className="eyebrow" style={{ margin: '28px 0 10px' }}>{t}</div>;
  return (
    <>
      <div style={card}>
        {row('Sessions per photo', 'Each photo is rated this many times.', stepper(s.sessions, (n) => save({ sessions: n }), 1, 12, 'sessions'))}
        {row('Spacing', 'The wait before each next session. Click to change.', (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {Array.from({ length: s.sessions }, (_, i) => {
              const v = s.intervals[Math.min(i, s.intervals.length - 1)];
              return <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{i > 0 && <span className="faint">→</span>}<button className="chip" aria-label={`Interval after session ${i + 1}: ${v}`} onClick={() => { const next = [...s.intervals]; while (next.length < s.sessions) next.push(next[next.length - 1] ?? '1 year'); next[i] = INTERVALS[(INTERVALS.indexOf(v) + 1) % INTERVALS.length]; void save({ intervals: next }); }}>{v}</button></span>;
            })}
          </div>
        ))}
        {row('Adapt to consistency', 'Steady ratings come back less often.', sw(s.adaptive, (v) => save({ adaptive: v }), 'Adapt to consistency'))}
        {row('Photos per review', 'How many are offered at once.', stepper(s.reviewSize ?? 12, (n) => save({ reviewSize: n }), 3, 100, 'photos per review'))}
        {row('Rating scale', undefined, seg([['emoji', '☹ → ☺'], ['stars', '★ 1–5']] as [string, string][], s.ratingStyle ?? 'emoji', (v) => save({ ratingStyle: v as 'emoji' | 'stars' }), 'Rating scale'))}
        {row('Hide scores while rating', 'Keeps each rating independent. Always on: earlier ratings are never shown during a review.', sw(true, () => undefined, 'Hide scores while rating'), true)}
      </div>
      {group('Ranking')}
      <div style={card}>
        {row('Guest ratings count for', 'In composition rankings.', w.data ? seg([[0, '0%'], [20, '20%'], [35, '35%'], [50, '50%']] as [number, string][], w.data.weight, (v) => { void api('/collections/guest-weight', { method: 'PUT', body: { weight: v } }).then(w.reload); }, 'Guest ratings weight') : null)}
        {row('Review new shoots first', 'Fresh photos jump the queue.', sw(s.newShootsFirst ?? true, (v) => save({ newShootsFirst: v }), 'Review new shoots first'), true)}
      </div>
      {group('Community')}
      <CommunitySettings />
      {group('Clean-up')}
      <div style={card}>
        {row('Suggest removing low-rated photos', 'After every session. Nothing is removed without asking.', sw(s.archiveSuggest, (v) => save({ archiveSuggest: v }), 'Suggest removing low-rated photos'))}
        <div style={{ padding: '12px 0' }}><DeleteSuggestions s={s} save={save} /></div>
      </div>
      {group('To do list')}
      <TodoReasons s={s} save={save} />
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

function About() {
  const h = useApi<{ version: string }>('/health');
  return (
    <>
      <p className="empty">Frames {h.data ? (h.data.version === 'dev' ? '(development build)' : `version ${h.data.version}`) : ''}</p>
      <div className="field"><h3>The welcome tour</h3><p>A short tour of bringing photographs in, photoshoots and compositions, reviewing and sharing.</p><Link to="/welcome" className="pill">Show the welcome tour</Link></div>
    </>
  );
}

