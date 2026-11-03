import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { imgUrl } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';

type P = Pick<PhotoLite, 'id' | 'ar'> & { hasImage?: boolean };

/** The photo preview, or a grey striped stand-in when no preview exists (for example a RAW with no embedded JPEG). */
export function Img({ p, kind = 'thumb', className = '', style }: { p: P; kind?: 'thumb' | 'preview'; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.id]);
  const hue = 190 + (p.id % 7) * 8;
  const st: React.CSSProperties = { aspectRatio: String(p.ar), ...style };
  if (p.hasImage === false || failed) {
    return <div className={'ph ' + className} role="img" aria-label="No preview available" style={{ ...st, background: `repeating-linear-gradient(135deg, hsl(${hue} 6% 22%) 0 10px, hsl(${hue} 6% 25%) 10px 20px)` }} />;
  }
  return <img className={'ph ' + className} src={imgUrl(p.id, kind)} alt="" loading="lazy" onError={() => setFailed(true)} style={{ ...st, objectFit: 'cover' }} />;
}

/** Contained, never cropped. The parent sets --fit-h (the height available to the photo). */
export function Fit({ p, className }: { p: P; className?: string }) {
  return <Img p={p} kind="preview" className={className} style={{ width: `min(100%, calc(var(--fit-h) * ${p.ar}))`, height: 'auto' }} />;
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

export const Loading = ({ error }: { error?: string | null }) => <div className="empty" role={error ? 'alert' : 'status'}>{error ? `Something went wrong: ${error}` : 'Loading…'}</div>;

export function BottomNav({ onSearch }: { onSearch: () => void }) {
  const { summary } = useStore();
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
      <button className="review" onClick={() => nav('/review')}>Review · {summary?.due ?? 0}</button>
    </nav>
  );
}

/** Justified rows: no cropping. Each tile grows by its aspect ratio. */
export function Justified({ photos, h = 190, onPick }: { photos: PhotoLite[]; h?: number; onPick?: (p: PhotoLite) => void }) {
  return (
    <div className="just">
      {photos.map((p) => {
        const st = { flex: `${p.ar} ${p.ar} ${p.ar * h}px`, aspectRatio: String(p.ar) };
        return onPick ? (
          <button key={p.id} style={st} onClick={() => onPick(p)} aria-label={p.title}><Img p={p} /></button>
        ) : (
          <Link key={p.id} to={`/photo/${p.id}`} style={st} aria-label={p.title}><Img p={p} /></Link>
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
