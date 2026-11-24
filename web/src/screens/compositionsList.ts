import { useSearchParams } from 'react-router-dom';
import type { CompositionStageName } from '../components/CompositionStage';

/** What the Compositions list shows, on a computer and a phone alike. */
export const KINDS = [['frames', 'Frames'], ['zines', 'Zines'], ['carousels', 'Carousels']] as const;
export const STAGES = [['progress', 'Progress'], ['review', 'Review'], ['done', 'Done']] as const;
export type ListKind = (typeof KINDS)[number][0];
/** The zine kind a list kind stands for (Frames is not a zine). */
export const zineKindOf = (k: ListKind) => (k === 'zines' ? 'zine' : 'carousel');

/** Created (by id: ids grow in creation order, and compositions keep no creation date) or Updated, newest first unless `asc`. */
export const listOrder = (created: boolean, asc: boolean) => (a: { id: number; updatedAt?: string }, b: { id: number; updatedAt?: string }) =>
  (asc ? 1 : -1) * (created ? a.id - b.id : (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || a.id - b.id);

/** Kind, stage, search and sort live in the address, so coming back from a composition keeps them. ?filter= is the older link form. */
export function useCompositionsQuery() {
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('stage') ?? sp.get('filter');
  const stage: CompositionStageName = filter === 'review' ? 'review' : ['done', 'ready', 'printed'].includes(filter ?? '') ? 'done' : 'progress';
  const kind: ListKind = KINDS.find(([k]) => k === sp.get('kind'))?.[0] ?? 'frames';
  const created = sp.get('sort') === 'created', asc = sp.get('dir') === 'asc', q = sp.get('find') ?? '';
  // Several keys change in one update: two separate calls in a row would each start from the same address and the first would be lost.
  const setAll = (vals: Record<string, string | null>) => setSp((cur) => { const n = new URLSearchParams(cur); n.delete('filter'); for (const [k, v] of Object.entries(vals)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const set = (k: string, v: string | null) => setAll({ [k]: v });
  return { kind, stage, created, asc, q, set, setAll };
}
