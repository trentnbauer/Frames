import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TodoNavItem } from '../store';
import { buildTasks, taskMeta } from '../todoTasks';

/** Where a row of the To do menu goes: a link of its own (near-duplicates, a cloud account), or a kind of task in the one-at-a-time view. */
export function todoDestination(item: TodoNavItem) {
  if (item.link) return item.link;
  return '/todo';
}

/**
 * The To do button. Hover (or focus) opens a menu of the kinds of task; clicking the button grabs the next task.
 * "Choose what counts" is in Settings, App settings.
 */
export function TodoNav({ total, items = [] }: { total: number; removals?: number; items?: TodoNavItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const nav = useNavigate();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, []);
  const tasks = useMemo(() => buildTasks(items), [items]);
  const first = tasks.rows[0];
  const dupes = items.find((i) => i.key === 'duplicates' && i.count > 0);
  const cloud = items.find((i) => i.key === 'cloud' && i.count > 0);
  const active = location.pathname === '/todo';
  return <div ref={root} className="todo-nav" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]; const index = links.indexOf(document.activeElement as HTMLAnchorElement); links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus(); }
  }}><button ref={trigger} className={'btodo' + (active ? ' on' : '')} aria-expanded={open} aria-controls="todo-navigation" title="To do (T)" onClick={() => nav('/todo')}>To do {total > 0 && <b className="mono">{total.toLocaleString()}</b>}<kbd className="kbd" aria-hidden="true">T</kbd></button>{open && <div className="todo-nav-popover" id="todo-navigation"><nav aria-label="To do tasks">
    {first && <Link to="/todo" className="todo-up-next"><span className="eyebrow">Up next</span><span className="todo-up-next-row"><span>{taskMeta(first.key)?.title} · {first.n.toLocaleString()} {first.n === 1 ? 'photo' : 'photos'}</span><span className="mono">Start →</span></span></Link>}
    {tasks.rows.length > 0 && <p className="eyebrow todo-nav-head">Or work through one task</p>}
    {tasks.rows.map((r) => <Link key={r.key} to={`/todo?task=${r.key}`}>{r.row}<span>{r.n.toLocaleString()}</span></Link>)}
    {!tasks.rows.length && !dupes && !cloud && <p className="muted">All caught up</p>}
    {(dupes || cloud) && <div className="msep" role="separator" />}
    {dupes && <Link to="/duplicates">Near-duplicates<span>{dupes.count.toLocaleString()}</span></Link>}
    {cloud && <Link to={cloud.link ?? '/settings?section=cloud'}>Reconnect cloud account<span>→</span></Link>}
    <div className="msep" role="separator" />
    <Link to="/settings?section=app">Choose what counts<span>→</span></Link>
  </nav></div>}</div>;
}
