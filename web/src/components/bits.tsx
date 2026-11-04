import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { imgUrl } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';

type P = Pick<PhotoLite, 'id' | 'ar'> & { hasImage?: boolean; share?: string };

/** The photo preview, or a grey striped stand-in when no preview exists (for example a RAW with no embedded JPEG). */
export function Img({ p, kind = 'thumb', className = '', style }: { p: P; kind?: 'thumb' | 'preview'; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.id]);
  const hue = 190 + (p.id % 7) * 8;
  const st: React.CSSProperties = { aspectRatio: String(p.ar), ...style };
  if (p.hasImage === false || failed) {
    return <div className={'ph ' + className} role="img" aria-label="No preview available" style={{ ...st, background: `repeating-linear-gradient(135deg, hsl(${hue} 6% 22%) 0 10px, hsl(${hue} 6% 25%) 10px 20px)` }} />;
  }
  return <img className={'ph ' + className} src={imgUrl(p.id, kind, p.share)} alt="" loading="lazy" onError={() => setFailed(true)} style={{ ...st, objectFit: 'cover' }} />;
}

/** Contained, never cropped. The parent sets --fit-h (the height available to the photo). */
export function Fit({ p, className }: { p: P; className?: string }) {
  return <Img p={p} kind="preview" className={className} style={{ width: `min(100%, calc(var(--fit-h) * ${p.ar}))`, height: 'auto' }} />;
}

/** The colours found in a photograph, widest first. */
export function Swatches({ palette }: { palette: { hex: string; pct: number; name: string }[] }) {
  if (!palette.length) return null;
  return (
    <div className="swatches" role="img" aria-label={`Colours: ${palette.map((s) => `${s.name} ${s.pct}%`).join(', ')}`}>
      {palette.map((s) => <i key={s.hex} title={`${s.name} · ${s.pct}%`} style={{ background: s.hex, flexGrow: Math.max(s.pct, 4) }} />)}
    </div>
  );
}

export function Mark({ w = 24 }: { w?: number }) {
  const s = w / 24;
  return (
    <svg width={24 * s} height={20 * s} viewBox="0 0 24 20" aria-hidden>
      <rect x="5.6" y="5.6" width="18" height="14" fill="none" stroke="#efede8" strokeOpacity=".4" strokeWidth="1.25" />
      <rect x="0" y="0" width="18" height="14" fill="#efede8" />
    </svg>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  const { me } = useStore();
  const signOut = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.assign('/'); };
  const links = (
    <nav className="toplinks">
      <NavLink to="/library" className={({ isActive }) => (isActive ? 'active' : '')}>Library</NavLink>
      <NavLink to="/for-you" className={({ isActive }) => (isActive ? 'active' : '')}>For you</NavLink>
      <NavLink to="/stats" className={({ isActive }) => (isActive ? 'active' : '')}>Stats</NavLink>
      <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>Settings</NavLink>
    </nav>
  );
  return (
    <header className="header">
      <Link to="/" className="lockup" aria-label="Frames home">
        <Mark />
        Frames
      </Link>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline' }}>
        <span className="t2" style={{ fontSize: 13 }}>{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        {right}
        {links}
        {/* Always there when someone is signed in with OAuth, whatever the page puts on the right. */}
        {me?.user && (
          <span className="faint" style={{ fontSize: 13, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${me.user.name ? `${me.user.name}, ` : ''}${me.user.email} (${me.role === 'admin' ? 'administrator' : 'member'}, signed in with ${me.user.provider})`}>
            {me.user.name && me.user.email && me.user.name !== me.user.email ? `${me.user.name} · ${me.user.email}` : me.user.email || me.user.name}{me.role === 'admin' ? ' · admin' : ''}
          </span>
        )}
        {me && !me.user && me.mode === 'password' && <span className="faint" style={{ fontSize: 13 }} title="Signed in with the shared password">Shared password</span>}
        {me?.user && <button className="toplinks" style={{ fontSize: 13 }} onClick={signOut} title={me.user.email || me.user.name}>Sign out</button>}
      </div>
    </header>
  );
}

export function Title({ children, count }: { children: ReactNode; count?: string }) {
  return (
    <div className="title-row">
      <h1 className="title">{children}</h1>
      {count && <span className="count">{count}</span>}
    </div>
  );
}

export const Loading = ({ error }: { error?: string | null }) => <div className="empty" role={error ? 'alert' : 'status'}>{error ? `Something went wrong: ${error}` : 'Loading…'}</div>;

export function BottomNav({ onSearch, onNew }: { onSearch: () => void; onNew: () => void }) {
  const { summary, todo } = useStore();
  const nav = useNavigate();
  const item = (to: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
  );
  return (
    <nav className="nav" aria-label="Primary">
      {item('/', 'Home')}
      {item('/library', 'Library')}
      {item('/shoots', 'Shoots')}
      {item('/collections', 'Compositions')}
      <span className="div" />
      <button className="search" onClick={onSearch}>Search or ask… <span>⌘K</span></button>
      <button className="review" onClick={() => nav('/review')}>Review · {summary?.due ?? 0}</button>
      <button className="newcomp" onClick={onNew}>+ Composition</button>
      {todo > 0 && <NavLink to="/todo" className={({ isActive }) => 'todo' + (isActive ? ' active' : '')}>To do · {todo}</NavLink>}
    </nav>
  );
}

/** Justified rows: no cropping. Each tile grows by its aspect ratio. */
export function Justified({ photos, h = 190, onPick, captions, picked, onTick }: { photos: PhotoLite[]; h?: number; onPick?: (p: PhotoLite) => void; captions?: (p: PhotoLite) => string; picked?: Set<number>; onTick?: (p: PhotoLite) => void }) {
  return (
    <div className="just">
      {photos.map((p) => {
        // Archived photos stay in the grid, just dimmed: they are only left out of review.
        const st = { flex: `${p.ar} ${p.ar} ${p.ar * h}px`, aspectRatio: String(p.ar), opacity: p.archived ? 0.55 : 1 };
        const cap = captions?.(p);
        const on = !!picked?.has(p.id);
        const inner = <><Img p={p} />{cap && <em className="cap">{cap}</em>}{onTick && <b className="tick">{on ? '✓' : ''}</b>}</>;
        if (onTick) return <button key={p.id} className={on ? 'picked' : ''} aria-pressed={on} style={{ ...st, position: 'relative' }} onClick={() => onTick(p)} aria-label={`Select ${p.title}`}>{inner}</button>;
        return onPick ? (
          <button key={p.id} style={{ ...st, position: 'relative' }} onClick={() => onPick(p)} aria-label={p.title}>{inner}</button>
        ) : (
          <Link key={p.id} to={`/photo/${p.id}`} style={{ ...st, position: 'relative' }} aria-label={p.title}>{inner}</Link>
        );
      })}
      <i />
    </div>
  );
}

/**
 * A text field's value that follows the server, but only when the server's value actually changes.
 * Resetting on every refresh would wipe what is being typed into a different field.
 */
export function useField(server: string, scope: string | number = ''): [string, (v: string) => void] {
  const [v, setV] = useState(server);
  const last = useRef(`${scope}\u0000${server}`);
  const now = `${scope}\u0000${server}`; // scope = which record, so moving to another photo never carries typed text over
  if (last.current !== now) { last.current = now; setV(server); }
  return [v, setV];
}

export function useKey(handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      handler(e);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
