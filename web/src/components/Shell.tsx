import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, openPortfolio, useApi } from '../api';
import { useStore } from '../store';
import { useUi } from '../ui';
import { Modal, Spinner } from './Modal';
import { ClearSiteDataModal } from './ClearSiteDataModal';

export function Mark({ w = 24 }: { w?: number }) {
  const s = w / 24;
  return (
    <svg width={24 * s} height={20 * s} viewBox="0 0 24 20" aria-hidden>
      <rect x="5.6" y="5.6" width="18" height="14" fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.25" />
      <rect x="0" y="0" width="18" height="14" fill="currentColor" />
    </svg>
  );
}

/** Which workflow step a path belongs to: Photoshoots 1; Library, Compositions and the editor 2. */
export const stepOf = (path: string): 1 | 2 | 3 | 0 => (/^\/shoots/.test(path) ? 1 : /^\/(library|collections)/.test(path) ? 2 : 0);

/** Notifications point at app paths (e.g. /collections/4?guests=suggestions, /#ideas). */
const ICON: Record<string, string> = { 'guest-suggestion': '✎', 'guest-rating': '★', 'guest-reply': '✎', 'community-rating': '★', idea: '✦', 'cloud-sync': '☁', 'report-outcome': '⚑', 'report-queue': '⚑', 'review-due': '◐', update: '↑', 'sign-in': '⎆', summary: '▦', 'gear-found': '▣' };
type Notif = { gear?: { id: number; name: string; type: 'camera' | 'lens'; state: string }; id: number; kind: string; text: string; createdAt: string; read: boolean; target: { screen: string; anchor?: string } };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};

export function EnvBanner() {
  const { me } = useStore();
  const nav = useNavigate();
  const drift = useApi<{ drift: number }>(me?.role === 'admin' ? '/admin/env/drift' : null);
  const n = drift.data?.drift ?? 0;
  if (me?.role !== 'admin' || n <= 0) return null;
  return (
    <button className="envbar" role="alert" onClick={() => nav('/settings?section=updates-system&env=diff')}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden style={{ flex: 'none' }}><path d="M12 3 2 21h20L12 3z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M12 10v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="18" r="1.2" fill="#fff" /></svg>
      <span style={{ fontWeight: 600 }}>Settings out of sync</span>
      <span className="env-sub">{n} server setting{n === 1 ? '' : 's'} in the app differ{n === 1 ? 's' : ''} from the .env file. A restart would bring back the file’s values.</span>
      <span className="env-go">Review and export .env →</span>
      <span className="env-short">Review →</span>
    </button>
  );
}

function Bell({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [items, setItems] = useState<Notif[]>([]);
  const [clearing, setClearing] = useState(false);
  const [acting, setActing] = useState<number | null>(null);
  const [clearError, setClearError] = useState('');
  const loadVersion = useRef(0);
  const load = useCallback(() => { const version = ++loadVersion.current; api<{ items: Notif[] }>('/notifications').then((r) => { if (version === loadVersion.current) setItems(r.items); }).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load, loc.pathname]);
  useEffect(() => { window.addEventListener('frames:gear-changed', load); return () => window.removeEventListener('frames:gear-changed', load); }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  const unread = items.filter((i) => !i.read).length;
  const go = (n: Notif) => {
    setOpen(false);
    setItems((l) => l.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
    api('/notifications/read', { body: { id: n.id } }).catch(() => undefined);
    const to = n.target.screen + (n.target.anchor ? `#${n.target.anchor}` : '');
    nav(to);
    if (n.target.anchor) setTimeout(() => document.getElementById(n.target.anchor!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };
  const clear = async () => {
    if (clearing) return;
    ++loadVersion.current; setClearing(true); setClearError('');
    try { await api('/notifications', { method: 'DELETE' }); setItems([]); load(); }
    catch (e) { setClearError((e as Error).message); load(); }
    finally { setClearing(false); }
  };
  const notificationAction = async (notification: Notif, action: 'dismiss' | 'add' | 'blacklist') => {
    if (acting !== null || clearing) return;
    ++loadVersion.current; setActing(notification.id); setClearError('');
    try {
      await api(`/notifications/${notification.id}${action === 'dismiss' ? '' : '/gear'}`, action === 'dismiss' ? { method: 'DELETE' } : { body: { action } });
      setItems((list) => list.filter((n) => n.id !== notification.id));
      if (action !== 'dismiss') window.dispatchEvent(new Event('frames:gear-changed'));
      load();
    } catch (e) { setClearError((e as Error).message); load(); }
    finally { setActing(null); }
  };
  const readAll = () => { setItems((l) => l.map((i) => ({ ...i, read: true }))); api('/notifications/read', { body: { all: true } }).catch(() => undefined); };
  return (
    <>
      <button className="iconbtn" title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M3.5 11.5V7a4.5 4.5 0 0 1 9 0v4.5l1 1h-11z" /><path d="M6.5 14h3" /></svg>
        {unread > 0 && <i className="dot" />}
      </button>
      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="popover notifs" role="dialog" aria-label="Notifications">
            <div className="spread" style={{ padding: '14px 16px 10px' }}>
              <span className="serif" style={{ fontSize: 22, lineHeight: 1 }}>Notifications</span>
              <div style={{ display: 'flex', gap: 12 }}><button style={{ fontSize: 12.5, color: unread ? 'var(--text2)' : 'var(--faint)' }} onClick={readAll} disabled={!unread || clearing || acting !== null}>Mark all read</button><button type="button" aria-label="Clear notifications" style={{ fontSize: 12.5, color: 'var(--text2)' }} disabled={!items.length || clearing || acting !== null} onClick={() => void clear()}>{clearing ? 'Clearing…' : 'Clear'}</button></div>
            </div>
            {clearError && <div role="alert" className="reason" style={{ margin: '0 16px 8px' }}>{clearError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 6px 6px', maxHeight: '60vh', overflow: 'auto' }}>
              {items.length === 0 && <div className="muted" style={{ padding: '18px 10px', fontSize: 13.5 }}>Nothing yet. New gear, guest replies, community ratings and ideas show up here.</div>}
              {items.map((n) => (
                <div key={n.id} className={'nrow' + (n.read ? '' : ' unread')} style={{ position: 'relative', display: 'block', padding: 0 }}>
                  <button className="notification-main" onClick={() => go(n)}>
                    <span className="nic" aria-hidden>{ICON[n.kind] ?? '•'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.4, color: n.read ? 'var(--text2)' : 'var(--text)' }}>{n.text}</div>
                      <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 2 }}>{ago(n.createdAt)}</div>
                    </div>
                    <i className="ndot" />
                  </button>
                  <button type="button" className="notification-dismiss" aria-label={`Dismiss ${n.text}`} title="Dismiss notification" disabled={clearing || acting !== null} onClick={() => void notificationAction(n, 'dismiss')}>×</button>
                  {n.gear?.state === 'new' && <div style={{ display: 'flex', gap: 8, padding: '0 34px 12px 46px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn outline" disabled={clearing || acting !== null} onClick={() => void notificationAction(n, 'add')}>Add to gear</button>
                    <button type="button" className="btn outline" disabled={clearing || acting !== null} onClick={() => void notificationAction(n, 'blacklist')}>Blacklist</button>
                  </div>}
                </div>
              ))}
            </div>
            <button className="mi" style={{ borderTop: '1px solid var(--hair)', borderRadius: 0, height: 'auto', padding: '10px 16px', fontSize: 12.5 }} onClick={() => { setOpen(false); nav('/settings?section=notifications'); }}>Notification settings</button>
          </div>
        </>
      )}
    </>
  );
}

function UserMenu({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const { me, summary, todo } = useStore();
  const nav = useNavigate();
  const health = useApi<{ version: string }>(open ? '/health' : null);
  const ver = health.data?.version ? (/^v?\d/.test(health.data.version) ? `v${health.data.version.replace(/^v/, '')}` : health.data.version) : '';
  const [resetOpen, setResetOpen] = useState(false);
  const name = me?.displayName || me?.user?.name || me?.user?.email || 'You';
  const close = () => setOpen(false);
  const go = (to: string) => () => { close(); nav(to); };
  const signOut = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.assign('/'); };
  const item = (label: string, onClick: (e: React.MouseEvent) => void, meta?: string) => <button key={label} className="mi" onClick={onClick}><span>{label}</span>{meta && <span className="meta">{meta}</span>}</button>;
  return (
    <>
      <button className="userbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" style={me?.hasAvatar ? { backgroundImage: 'url(/api/profile/avatar)' } : undefined}>{!me?.hasAvatar && name.slice(0, 1).toUpperCase()}</span>
        <span className="uname">{name.split(' ')[0]}</span><span className="caret" style={{ color: 'var(--faint)' }}>▾</span>
      </button>
      {open && (
        <>
          <div className="pop-scrim" onClick={close} />
          <div className="popover" role="menu" aria-label="Your menu" style={{ right: 42 }}>
            <div className="mwho">
              <span className="avatar" style={{ width: 36, height: 36, ...(me?.hasAvatar ? { backgroundImage: 'url(/api/profile/avatar)' } : {}) }}>{!me?.hasAvatar && name.slice(0, 1).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}><b>{name}</b><span className="em">{me?.user?.email || (me?.mode === 'password' ? 'Signed in with the shared password' : '')}</span></div>
              {me?.role === 'admin' && <span className="eyebrow pillish">Admin</span>}
            </div>
            {item('Settings', go('/settings'), '⌘ ,')}
            {item('View my portfolio', () => { close(); void openPortfolio(); }, '↗')}
            {item('Gear & wishlist', go('/gear'))}
            <div className="msep" />
            {item('Your stats', go('/stats'), summary ? `${summary.total.toLocaleString()} photos` : '')}
            {item('To do', go('/todo'), todo ? todo.toLocaleString() : '')}
            {item('Community review', go('/community'))}
            {item('Near-duplicates', go('/duplicates'))}
            <div className="msep" />
            {item('What’s new', () => { close(); window.dispatchEvent(new Event('frames:whatsnew')); }, ver)}
            {item('Help & docs', () => { close(); window.open('https://github.com/trentnbauer/Frames#readme', '_blank', 'noopener'); }, '↗')}
            {item('Send feedback', () => { close(); window.dispatchEvent(new Event('frames:feedback')); }, 'GitHub')}
            <div className="msep" />
            {item('Clear site data', () => { close(); setResetOpen(true); })}
            {me?.user && item('Sign out', signOut)}
          </div>
        </>
      )}
      {resetOpen && <ClearSiteDataModal onClose={() => setResetOpen(false)} />}
    </>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  const loc = useLocation();
  const [menu, setMenu] = useState<'user' | 'bell' | null>(null);
  useEffect(() => setMenu(null), [loc.pathname]);
  return (
    <header className="shell-head">
      <Link to="/" className="lockup" aria-label="Frames home"><Mark />Frames</Link>
      <span />
      <div className="head-right">
        {right}
        <UserMenu open={menu === 'user'} setOpen={(b) => setMenu(b ? 'user' : null)} />
        <Bell open={menu === 'bell'} setOpen={(b) => setMenu(b ? 'bell' : null)} />
      </div>
    </header>
  );
}

/** The floating bar from the design: Home, Shoots, Library, Compositions, then Search and To do with its count. Desktop and tablet only. */
export function BottomNav() {
  const { todo } = useStore();
  const ui = useUi();
  const item = (to: string, label: string) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>;
  return (
    <nav className="bnav" aria-label="Primary">
      {item('/', 'Home')}{item('/shoots', 'Shoots')}{item('/library', 'Library')}{item('/collections', 'Compositions')}
      <i className="bdiv" />
      <button className="bsearch" onClick={ui.openSearch}>Search <span className="mono">⌘K</span></button>
      {todo > 0 && <NavLink to="/todo" className="btodo">To do <b className="mono">{todo.toLocaleString()}</b></NavLink>}
    </nav>
  );
}

/** Phone only: the workflow steps live here. */
export function TabBar() {
  const loc = useLocation();
  const step = stepOf(loc.pathname);
  const [more, setMore] = useState(false);
  const nav = useNavigate();
  return (
    <>
      <nav className="tabbar" aria-label="Workflow">
        <NavLink to="/shoots" className={step === 1 ? 'on' : ''}>Upload</NavLink>
        <NavLink to="/collections" className={step === 2 ? 'on' : ''}>Compose</NavLink>
        <NavLink to="/collections?filter=done">Export</NavLink>
        <button onClick={() => setMore(true)}>More</button>
      </nav>
      {more && (
        <>
          <div className="pop-scrim" onClick={() => setMore(false)} />
          <div className="popover" role="menu">
            {[['Home', '/'], ['Library', '/library'], ['Review', '/review'], ['Gear & wishlist', '/gear'], ['Your stats', '/stats'], ['To do', '/todo'], ['Community review', '/community'], ['Settings', '/settings']].map(([l, to]) => (
              <button key={to} className="mi" onClick={() => { setMore(false); nav(to); }}>{l}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const KINDS = [['bug', 'Bug', 'Short summary of the problem'], ['enhancement', 'Idea', 'What would you like Frames to do?'], ['question', 'Question', 'What do you want to know?']] as const;

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const loc = useLocation();
  const health = useApi<{ version: string }>('/health');
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctx, setCtx] = useState(true);
  const version = health.data?.version ?? 'dev';
  const ctxText = `${loc.pathname} · v${version.replace(/^v/, '')}`;
  const ok = title.trim().length > 0;
  const send = () => {
    if (!ok) return;
    const text = body.trim() + (ctx ? `${body.trim() ? '\n\n' : ''}---\nPage: ${loc.pathname}\nVersion: ${version}` : '');
    const q = new URLSearchParams({ title: title.trim(), body: text, labels: kind });
    window.open(`https://github.com/trentnbauer/Frames/issues/new?${q.toString()}`, '_blank', 'noopener');
    onClose();
  };
  return (
    <Modal title="Send feedback" sub="Opens a new issue on GitHub · trentnbauer/Frames. You can check it before posting." onClose={onClose}
      foot={<><span className="grow">{ok ? '' : 'Add a title to continue.'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" style={{ opacity: ok ? 1 : .45 }} onClick={send} disabled={!ok}>Open issue on GitHub ↗</button></>}>
      <div className="seg" role="tablist">{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <input className="field-in" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={KINDS.find((k) => k[0] === kind)![2]} aria-label="Title" />
      <textarea className="field-in" value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="What happened, and what did you expect?" aria-label="Details" />
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={ctx} onChange={(e) => setCtx(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Include page and version <span className="mono faint" style={{ fontSize: 12 }}>{ctxText}</span><br />No photos, names or emails are added.</span>
      </label>
    </Modal>
  );
}

type Rel = { name: string; date: string; url: string; items: string[] };

/**
 * One place for every pop-up the header menus open, and the once-per-session update notice for administrators.
 * Mounted once by the shell.
 */
export function ShellModals() {
  const { me } = useStore();
  const [fb, setFb] = useState(false);
  const [news, setNews] = useState(false);
  const [upd, setUpd] = useState(false);
  const admin = me?.role === 'admin';
  const rel = useApi<{ current: string; releases: Rel[]; all: Rel[]; source: string }>(me ? '/releases' : null);
  useEffect(() => {
    const a = () => setFb(true), b = () => setNews(true);
    window.addEventListener('frames:feedback', a); window.addEventListener('frames:whatsnew', b);
    return () => { window.removeEventListener('frames:feedback', a); window.removeEventListener('frames:whatsnew', b); };
  }, []);
  useEffect(() => {
    if (!admin || !rel.data?.releases.length) return;
    try {
      if (sessionStorage.getItem('frames-upd-shown')) return;
      const until = Number(localStorage.getItem('frames-upd-remind') ?? 0);
      if (until > Date.now()) return;
      sessionStorage.setItem('frames-upd-shown', '1');
    } catch { /* shown every time if storage is blocked */ }
    setUpd(true);
  }, [admin, rel.data]);
  const [copied, setCopied] = useState(false);
  const cmd = 'docker compose pull && docker compose up -d';
  const list = (upd ? rel.data?.releases : rel.data?.all) ?? [];
  return (
    <>
      {fb && <FeedbackModal onClose={() => setFb(false)} />}
      {(upd || news) && (
        <Modal width={600} eyebrow={upd ? 'Admin · update available' : undefined} title={upd ? `Frames ${list[0]?.name ?? ''} is available` : 'What’s new'}
          sub={upd ? `You’re on v${(rel.data?.current ?? '').replace(/^v/, '')}.` : `You’re on v${(rel.data?.current ?? '').replace(/^v/, '')}.`}
          onClose={() => { setUpd(false); setNews(false); }}
          foot={<><span className="grow">{rel.data?.source === 'none' ? 'Could not reach GitHub' : 'Source: GitHub Releases'}</span>
            {upd && <button className="btn" onClick={() => { try { localStorage.setItem('frames-upd-remind', String(Date.now() + 86_400_000)); } catch { /* */ } setUpd(false); }}>Remind me tomorrow</button>}
            <button className="btn primary" onClick={() => { setUpd(false); setNews(false); }}>Got it</button></>}>
          {rel.loading && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', fontSize: 13.5, color: 'var(--text2)' }}><Spinner />Fetching release notes from GitHub…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 360, overflow: 'auto' }}>
            {list.length === 0 && !rel.loading && <p className="muted" style={{ fontSize: 13.5 }}>No release notes to show.</p>}
            {list.map((r) => (
              <div key={r.url} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 0', borderTop: '1px solid var(--hair)' }}>
                <div className="spread"><a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, fontSize: 14 }}>{r.name} <span className="faint">↗</span></a><span className="mono faint" style={{ fontSize: 12 }}>{r.date}</span></div>
                {r.items.map((it, i) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}><span style={{ color: 'var(--disabled)' }}>–</span><span>{it}</span></div>)}
              </div>
            ))}
          </div>
          {upd && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--hair)' }}>
              <code className="mono" style={{ flex: 1, fontSize: 12.5 }}>{cmd}</code>
              <button style={{ fontSize: 12.5, color: 'var(--text2)' }} onClick={() => { navigator.clipboard?.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
