import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { TodoNavItem } from '../store';
const LABELS: Record<string, string> = { delete: 'Removal review', camera: 'Missing camera', lens: 'Missing lens', tags: 'Missing tags', subjects: 'Missing subjects', place: 'Missing location', time: 'Missing date and time', composition: 'Not in a composition', 'ai-tags': 'Suggested tags and subjects', 'ai-description': 'Suggested descriptions', colours: 'Missing colours', light: 'Missing light', mood: 'Missing mood', cloud: 'Reconnect cloud account' };
const REASONS: Record<string, string> = { camera: 'camera', lens: 'lens', tags: 'tags', subjects: 'subjects', place: 'location', composition: 'composition' };
export function todoDestination(item: TodoNavItem) {
  if (item.key === 'delete') return '/removals';
  if (item.link) return item.link;
  if (REASONS[item.key]) return `/todo?reason=${REASONS[item.key]}`;
  return item.ids?.length ? `/photo/${item.ids[0]}?todo=${encodeURIComponent(item.key)}` : '/todo';
}
export function TodoNav({ total, removals, items = [] }: { total: number; removals: number; items?: TodoNavItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, []);
  const waiting = items.filter((item) => item.count > 0 && item.key !== 'delete');
  if (removals > 0) waiting.unshift({ key: 'delete', count: removals });
  const active = location.pathname === '/todo' || location.pathname === '/removals';
  return <div ref={root} className="todo-nav" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]; const index = links.indexOf(document.activeElement as HTMLAnchorElement); links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus(); }
  }}><button ref={trigger} className={'btodo' + (active ? ' on' : '')} aria-expanded={open} aria-controls="todo-navigation" title="To do (T)" onClick={() => setOpen(true)}>To do {total > 0 && <b className="mono">{total.toLocaleString()}</b>}<kbd className="kbd" aria-hidden="true">T</kbd></button>{open && <div className="todo-nav-popover" id="todo-navigation"><nav aria-label="To do tasks"><Link to="/todo">All to do <span>{total.toLocaleString()}</span></Link>{waiting.map((item) => <Link key={item.key} to={todoDestination(item)}>{LABELS[item.key] ?? item.title ?? item.key}<span>{item.count.toLocaleString()}</span></Link>)}{!waiting.length && <p className="muted">All caught up</p>}</nav></div>}</div>;
}
