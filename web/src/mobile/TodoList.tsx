import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { TASKS, buildTasks, type TaskKey } from '../todoTasks';
import { BackPill, Eyebrow, Row } from './ui';

const SUB: Record<TaskKey, string> = {
  delete: 'Below your removal threshold', 'ai-tags': 'Accept or reject what the AI suggested', tags: 'Make photos findable', 'ai-desc': 'Use, edit or replace the AI’s words',
  desc: 'One sentence is enough', location: 'Pin them on the map', camera: 'Fill in what the metadata missed', time: 'No capture time recorded', light: 'No note about the light', mood: 'No note about the mood', composition: 'Not in any composition yet',
};
const GROUPS: [string, TaskKey[]][] = [['REVIEW', ['delete']], ['MISSING DETAILS', ['ai-tags', 'tags', 'ai-desc', 'desc', 'location', 'camera', 'time', 'light', 'mood']], ['COMPOSITIONS', ['composition']]];

/** To do on a phone: the kinds of task as a list with counts. A row opens that kind in the one-at-a-time view. */
export function MobileTodoList() {
  const nav = useNavigate();
  const { summary, todoItems } = useStore();
  const tasks = useMemo(() => buildTasks(todoItems), [todoItems]);
  const n = (k: TaskKey) => tasks.rows.find((r) => r.key === k)?.n ?? 0;
  const due = summary?.due ?? 0;
  const dupes = todoItems.find((i) => i.key === 'duplicates')?.count ?? 0;
  const total = tasks.rows.reduce((a, r) => a + r.n, 0) + due + dupes;
  type R = { label: string; sub: string; count: number; go: () => void };
  const groups: { title: string; rows: R[] }[] = GROUPS.map(([title, keys]) => ({ title, rows: keys.filter((k) => n(k) > 0).map((k): R => ({ label: TASKS.find((t) => t.key === k)!.row, sub: SUB[k], count: n(k), go: () => nav(`/todo?task=${k}`) })) }));
  if (due > 0) groups[0].rows.unshift({ label: 'Photographs due for review', sub: 'Rate them again', count: due, go: () => nav('/review') });
  if (dupes > 0) groups[2].rows.push({ label: 'Near-duplicates', sub: 'Pick which to keep', count: dupes, go: () => nav('/duplicates') });
  const shown = groups.filter((g) => g.rows.length);
  return (
    <div className="ppage" data-screen-label="To do">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ paddingTop: 4 }}><BackPill label="Home" /></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h1 style={{ font: '400 40px/1 var(--serif)', margin: 0 }}>To do</h1><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>{total}</span></div>
        {shown.map((g) => (
          <div key={g.title} style={{ display: 'flex', flexDirection: 'column' }}>
            <Eyebrow style={{ paddingBottom: 6 }}>{g.title}</Eyebrow>
            {g.rows.map((r) => <Row key={r.label} label={r.label} sub={r.sub} count={r.count} onClick={r.go} />)}
          </div>
        ))}
        {!shown.length && <div style={{ padding: '24px 0', fontSize: 14, color: 'var(--muted)' }}>You’re all caught up.</div>}
        <button onClick={() => nav('/settings?section=app')} style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 13, color: 'var(--text2)' }}>Choose what counts</button>
      </div>
    </div>
  );
}
