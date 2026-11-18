import type { TodoNavItem } from './store';

/**
 * The kinds of task in To do, most important first. A photograph is shown only for the first kind it is waiting on (removal outranks
 * everything), and comes back later for the others.
 */
export const TASKS = [
  { key: 'orphaned', title: 'Put photographs in a shoot', row: 'Put photos in a shoot', later: 'a shoot' },
  { key: 'delete', title: 'Removal review', row: 'Removal review', later: 'removal review' },
  { key: 'ai-tags', title: 'Accept AI tags', row: 'Accept AI tags', later: 'AI tags' },
  { key: 'tags', title: 'Add tags', row: 'Add tags', later: 'tags' },
  { key: 'ai-desc', title: 'Accept AI description', row: 'Accept AI descriptions', later: 'an AI description' },
  { key: 'desc', title: 'Add a description', row: 'Add descriptions', later: 'a description' },
  { key: 'location', title: 'Set the location', row: 'Set locations', later: 'location' },
  { key: 'camera', title: 'Add camera specs', row: 'Add camera specs', later: 'camera specs' },
  { key: 'time', title: 'Set the date and time', row: 'Set dates and times', later: 'a date and time' },
  { key: 'light', title: 'Describe the light', row: 'Describe the light', later: 'a light note' },
  { key: 'mood', title: 'Describe the mood', row: 'Describe the mood', later: 'a mood note' },
  { key: 'composition', title: 'Add to a composition', row: 'Add to compositions', later: 'a composition' },
] as const;
export type TaskKey = (typeof TASKS)[number]['key'];
export const taskMeta = (key: string) => TASKS.find((t) => t.key === key);

/** Which kind of task each list from the server belongs to. */
const GROUP_OF: Record<string, TaskKey> = {
  delete: 'delete', 'ai-tags': 'ai-tags', tags: 'tags', 'ai-description': 'ai-desc', description: 'desc',
  place: 'location', camera: 'camera', lens: 'camera', time: 'time', light: 'light', mood: 'mood', composition: 'composition',
};

export type Tasks = {
  /** Every photograph waiting, with the kinds it waits on (most important first). */
  byPhoto: Map<number, TaskKey[]>;
  /** The photographs whose first kind is this one, most important first. */
  queue: (mode: TaskKey | 'all') => number[];
  rows: { key: TaskKey; row: string; n: number }[];
};

export function buildTasks(items: TodoNavItem[]): Tasks {
  const rank = (k: TaskKey) => TASKS.findIndex((t) => t.key === k);
  const byPhoto = new Map<number, Set<TaskKey>>();
  for (const item of items) {
    const group = GROUP_OF[item.key];
    if (!group) continue;
    for (const id of item.ids ?? []) (byPhoto.get(id) ?? byPhoto.set(id, new Set()).get(id)!).add(group);
  }
  const sorted = new Map<number, TaskKey[]>([...byPhoto].map(([id, set]) => [id, [...set].sort((a, b) => rank(a) - rank(b))]));
  const queue = (mode: TaskKey | 'all') => [...sorted].filter(([, ks]) => mode === 'all' || ks[0] === mode).sort((a, b) => rank(a[1][0]) - rank(b[1][0]) || b[0] - a[0]).map(([id]) => id);
  // Photographs in no shoot are one list of their own, not one-at-a-time cards.
  const orphans = items.find((i) => i.key === 'orphaned')?.count ?? 0;
  const rows = TASKS.map((t) => ({ key: t.key, row: t.row, n: t.key === 'orphaned' ? orphans : queue(t.key).length })).filter((r) => r.n > 0);
  return { byPhoto: sorted, queue, rows };
}

/** AI suggestions still waiting on a decision: saving a photograph without accepting them counts as rejecting them. */
export const unacceptedAiTags = <T extends { source: string; accepted: boolean }>(tags: T[]) => tags.filter((t) => t.source === 'ai' && !t.accepted);
