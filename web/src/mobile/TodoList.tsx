import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { imgUrl, useApi } from '../api';
import type { Shoot } from '../data';
import { useStore } from '../store';
import { TASKS, buildTasks, taskTotals, type TaskKey } from '../todoTasks';
import { TabAvatar } from './Chrome';
import { ReviewCard } from './ReviewCard';
import { Eyebrow, Row } from './ui';

export const SUB: Record<TaskKey, string> = {
  orphaned: 'Not in any photoshoot yet', delete: 'Below your removal threshold', 'ai-tags': 'Accept or reject what the AI suggested', tags: 'Make photos findable', 'ai-desc': 'Use, edit or replace the AI’s words',
  desc: 'One sentence is enough', location: 'Pin them on the map', camera: 'Fill in what the metadata missed', time: 'No capture time recorded', light: 'No note about the light', mood: 'No note about the mood', composition: 'Not in any composition yet',
};
const GROUPS: [string, TaskKey[]][] = [['PUT AWAY', ['orphaned']], ['MISSING DETAILS', ['ai-tags', 'tags', 'ai-desc', 'desc', 'location', 'camera', 'time', 'light', 'mood']], ['COMPOSITIONS', ['composition']]];

/** The number the To do tab and the desktop dock both show: the server's own total of what is waiting. */
export function useTodoTotal() {
  return useStore().todo;
}

/** To do on a phone (a tab): the review prompt, removal and community review, then the kinds of task as a list with counts. */
export function MobileTodoList() {
  const nav = useNavigate();
  const { summary, todoItems } = useStore();
  const tasks = useMemo(() => buildTasks(todoItems), [todoItems]);
  const totals = useMemo(() => taskTotals(todoItems), [todoItems]);
  // The count on a row is every photograph missing that, not just the ones it is first in line for.
  const n = (k: TaskKey) => Math.max(totals[k] ?? 0, tasks.rows.find((r) => r.key === k)?.n ?? 0);
  const due = summary?.due ?? 0;
  const dupes = todoItems.find((i) => i.key === 'duplicates')?.count ?? 0;
  const total = useTodoTotal();
  const community = useApi<{ enabled: boolean; waiting: number }>('/community/summary');
  const shoots = useApi<Shoot[]>('/shoots');
  const [byShoot, setByShoot] = useState(false);
  const dueShoots = (shoots.data ?? []).filter((x) => x.dueCount > 0).sort((a, b) => b.dueCount - a.dueCount);
  type R = { label: string; sub: string; count: number; go: () => void };
  const groups: { title: string; rows: R[] }[] = GROUPS.map(([title, keys]) => ({ title, rows: keys.filter((k) => n(k) > 0).map((k): R => ({ label: TASKS.find((t) => t.key === k)!.row, sub: SUB[k], count: n(k), go: () => nav(`/todo?task=${k}`) })) }));
  if (dupes > 0) groups[1].rows.push({ label: 'Near-duplicates', sub: 'Pick which to keep', count: dupes, go: () => nav('/duplicates') });
  const shown = groups.filter((g) => g.rows.length);
  const removals = n('delete');
  return (
    <div className="pscreen ptab headless" data-screen-label="To do" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>To do</h1><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>{total}</span><span style={{ flex: 1 }} /><TabAvatar /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ReviewCard>
        {removals > 0 && <Row label="Removal review" sub={`${removals} below your removal threshold`} count={removals} onClick={() => nav('/removals')} />}
        {community.data?.enabled && <Row label="Community review" sub={`${community.data.waiting} photos from other photographers`} onClick={() => nav('/community')} />}
        {due > 0 && <Row label="Review anyway" sub="The ones you haven’t seen for longest" onClick={() => nav('/review?early')} />}
        {dueShoots.length > 0 && <button onClick={() => setByShoot(!byShoot)} aria-expanded={byShoot} style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 13, color: 'var(--text2)' }}>By shoot {byShoot ? '⌄' : '›'}</button>}
        {byShoot && dueShoots.map((x) => <Row key={x.id} label={x.name} thumb={x.coverId ? imgUrl(x.coverId, 'thumb') : ''} meta={`${x.dueCount} due`} onClick={() => nav(`/shoots/${x.id}`)} />)}
      </ReviewCard>
      </div>
      {shown.map((g) => (
        <div key={g.title} style={{ display: 'flex', flexDirection: 'column' }}>
          <Eyebrow style={{ paddingBottom: 6 }}>{g.title}</Eyebrow>
          {g.rows.map((r) => <Row key={r.label} label={r.label} sub={r.sub} count={r.count} onClick={r.go} />)}
        </div>
      ))}
      {!shown.length && !removals && <div style={{ padding: '24px 0', fontSize: 14, color: 'var(--muted)' }}>You’re all caught up.</div>}
      <button onClick={() => nav('/settings?section=app')} style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 13, color: 'var(--text2)' }}>Choose what counts</button>
    </div>
  );
}
