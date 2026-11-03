import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import type { Photo } from '../data';
import { useStore } from '../store';

/** Grey striped stand-in until real previews exist. Keeps the true aspect ratio. */
export function Img({ p, className = '', style }: { p: Pick<Photo, 'ar' | 'hue'>; className?: string; style?: React.CSSProperties }) {
  const l = 20 + (p.hue % 7) * 2;
  return (
    <div
      className={'ph ' + className}
      role="img"
      aria-label="Photo preview placeholder"
      style={{
        aspectRatio: String(p.ar),
        background: `repeating-linear-gradient(135deg, hsl(${p.hue} 6% ${l}%) 0 10px, hsl(${p.hue} 6% ${l + 3}%) 10px 20px)`,
        ...style,
      }}
    />
  );
}

/** Contained, never cropped. The parent sets --fit-h (the height available to the photo). */
export function Fit({ p, className }: { p: Pick<Photo, 'ar' | 'hue'>; className?: string }) {
  return <Img p={p} className={className} style={{ width: `min(100%, calc(var(--fit-h) * ${p.ar}))`, height: 'auto' }} />;
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
  return (
    <header className="header">
      <Link to="/" className="lockup" aria-label="Frames home">
        <Mark />
        Frames
      </Link>
      {right ?? (
        <nav className="toplinks">
          <NavLink to="/stats" className={({ isActive }) => (isActive ? 'active' : '')}>Stats</NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>Settings</NavLink>
        </nav>
      )}
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

export function BottomNav({ onSearch }: { onSearch: () => void }) {
  const { dueCount } = useStore();
  const nav = useNavigate();
  const item = (to: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
  );
  return (
    <nav className="nav" aria-label="Primary">
      {item('/', 'Today')}
      {item('/library', 'Library')}
      {item('/shoots', 'Shoots')}
      {item('/collections', 'Collections')}
      {item('/for-you', 'For you')}
      <span className="div" />
      <button className="search" onClick={onSearch}>Search or ask… <span>⌘K</span></button>
      <button className="review" onClick={() => nav('/review')}>Review · {dueCount}</button>
    </nav>
  );
}

/** Justified rows: no cropping. Each tile grows by its aspect ratio. */
export function Justified({ photos, h = 190, onPick }: { photos: Photo[]; h?: number; onPick?: (p: Photo) => void }) {
  return (
    <div className="just">
      {photos.map((p) => {
        const inner = <Img p={p} />;
        const st = { flex: `${p.ar} ${p.ar} ${p.ar * h}px`, aspectRatio: String(p.ar) };
        return onPick ? (
          <button key={p.id} style={st} onClick={() => onPick(p)} aria-label={p.title}>{inner}</button>
        ) : (
          <Link key={p.id} to={`/photo/${p.id}`} style={st} aria-label={p.title}>{inner}</Link>
        );
      })}
      <i />
    </div>
  );
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
