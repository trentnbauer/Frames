import './phone.css';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { openPortfolio, useApi } from '../api';
import { Sheet } from '../components/Sheet';
import { useStore } from '../store';
import { useTodoTotal } from './TodoList';

/** The paths the floating tab bar belongs to: the five tab roots. Detail screens (a photo, a shoot, notifications…) are pages above it. */
export const TAB_PATHS: Record<string, 'home' | 'library' | 'todo' | 'comps' | 'gear'> = { '/': 'home', '/library': 'library', '/shoots': 'library', '/todo': 'todo', '/collections': 'comps', '/gear': 'gear' };

/** Which tab a path belongs to. To do's one-at-a-time view (?task=) is a page above the tab bar, not the tab root. */
export function tabFor(pathname: string, search = '') {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/todo' && /[?&]task=/.test(search)) return undefined;
  return TAB_PATHS[p];
}

const ICON = {
  home: <path d="M3.5 9 10 3.8 16.5 9v7.2h-4.2v-4.4H7.7v4.4H3.5z" strokeLinejoin="round" />,
  library: <><rect x="3.5" y="3.5" width="5.5" height="5.5" /><rect x="11" y="3.5" width="5.5" height="5.5" /><rect x="3.5" y="11" width="5.5" height="5.5" /><rect x="11" y="11" width="5.5" height="5.5" /></>,
  todo: <><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M7 10.2l2.2 2.2L13.2 7.6" strokeLinecap="round" strokeLinejoin="round" /></>,
  comps: <><rect x="6.5" y="6.5" width="10.5" height="8.5" strokeOpacity=".5" /><rect x="3" y="3.5" width="10.5" height="8.5" /></>,
  gear: <><rect x="2.5" y="6" width="15" height="10" rx="1.5" strokeLinejoin="round" /><path d="M7 6l1.2-2h3.6L13 6" strokeLinejoin="round" /><circle cx="10" cy="11" r="2.8" /></>,
};
const TABS: [keyof typeof ICON, string, string][] = [['home', 'Home', '/'], ['library', 'Library', '/library'], ['todo', 'To do', '/todo'], ['comps', 'Compositions', '/collections'], ['gear', 'Gear', '/gear']];

/** The phone's floating tab bar: Home, Library, To do (with its total), Compositions, Gear. Only on the five tab pages. */
export function PhoneTabBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const cur = tabFor(loc.pathname, loc.search);
  const todoTotal = useTodoTotal();
  if (!cur) return null;
  return (
    <nav aria-label="Primary" className="ptabbar">
      {TABS.map(([k, label, to]) => {
        const on = cur === k;
        const badge = k === 'todo' ? todoTotal : 0;
        return (
          <button key={k} onClick={() => nav(to)} aria-current={on ? 'page' : undefined} style={{ position: 'relative', flex: 1, borderRadius: 999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: on ? 'var(--chip)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>{ICON[k]}</svg>
            <span style={{ fontSize: 11, letterSpacing: '.01em' }}>{label}</span>
            {badge > 0 && <span aria-label={`${badge} to do`} style={{ position: 'absolute', top: 5, left: '50%', marginLeft: 6, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 999, background: 'var(--accent)', color: '#0d0d0d', font: '600 10px/16px var(--mono)', textAlign: 'center' }}>{badge > 99 ? '99+' : badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** "Your menu" on a phone: a sheet of the places that are not tabs. */
export function PhoneMeSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const nav = useNavigate();
  const { me } = useStore();
  const batches = useApi<{ left: number }>('/home/batches');
  const removed = useApi<unknown[]>('/recovery');
  const unread = useApi<{ items: { read: boolean }[] }>('/notifications').data?.items.filter((i) => !i.read).length ?? 0;
  const go = (to: string) => () => { onClose(); nav(to); };
  const signOut = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.assign('/'); };
  const rows: { label: string; sub?: string; meta?: string; act: () => void; fg?: string; gap?: boolean }[] = [
    { label: 'Notifications', meta: unread ? String(unread) : '', act: go('/notifications') },
    { label: 'Add photos', sub: 'Upload from this phone or sync from the cloud', act: go('/library?add=1') },
    { label: 'Organise uploads', sub: 'Name new batches as shoots', meta: batches.data?.left ? String(batches.data.left) : '', act: go('/organise') },
    { label: 'Stats', act: go('/stats'), gap: true },
    { label: 'Recently removed', meta: Array.isArray(removed.data) && removed.data.length ? String(removed.data.length) : '', act: go('/activity') },
    { label: 'View portfolio', meta: '↗', act: () => { onClose(); void openPortfolio(); } },
    { label: 'Settings', act: go('/settings'), gap: true },
    ...(me?.user ? [{ label: 'Sign out', fg: 'var(--text2)', gap: true, act: () => { void signOut(); } }] : []),
  ];
  return (
    <Sheet title={name} sub={me?.role === 'admin' ? 'Admin' : undefined} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <button key={r.label} onClick={r.act} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: '1px solid var(--hair)', marginTop: r.gap ? 8 : 0, textAlign: 'left', color: r.fg ?? 'var(--text)' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>{r.label}</span>{r.sub && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{r.sub}</span>}</span>
            {r.meta && <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{r.meta}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

