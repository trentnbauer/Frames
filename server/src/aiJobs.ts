import { policyOf } from './policy.js';
import { getSetting, setSetting, type DB } from './db.js';
import { isReady, loadShared, loadSources } from './aisources.js';

/**
 * Which AI does what. Each job has an on/off switch and an order of providers: the first one that is ready is used. A provider
 * added later joins the end of every list, and at least one provider stays in use for each job. (When a provider errors, the
 * caller may try the next one with `orderFor`.)
 */
export const JOBS = ['search', 'describe', 'sensitive', 'ideas'] as const;
export type Job = (typeof JOBS)[number];
export type JobCfg = { on: boolean; order: string[]; skip: string[] };
export type Jobs = Record<Job, JobCfg>;

const ids = (db: DB) => [...loadSources(db), ...loadShared(db)].map((s) => s.id);

/** The saved settings, cleaned against the providers that exist now: gone ones dropped, new ones at the end. */
export function loadJobs(db: DB): Jobs {
  const saved = getSetting<Partial<Jobs>>(db, 'aiJobs', {});
  const sys = (db as unknown as { sys?: DB }).sys;
  // With no order of their own yet, and the administrator's wish, the shared AIs come first.
  const all = !getSetting<unknown>(db, 'aiJobs', null) && sys && policyOf(sys).aiSharedFirst ? [...loadShared(db).map((s) => s.id), ...loadSources(db).map((s) => s.id)] : ids(db);
  const out = {} as Jobs;
  for (const j of JOBS) {
    const s = saved[j];
    const order = [...(s?.order ?? []).filter((i) => all.includes(i)), ...all.filter((i) => !(s?.order ?? []).includes(i))];
    out[j] = { on: s?.on !== false, order, skip: (s?.skip ?? []).filter((i) => all.includes(i)) };
  }
  return out;
}

/** The providers to try for a job, best first: in order, not skipped, and ready to use. Empty when the job is off. */
export function orderFor(db: DB, job: Job): string[] {
  const c = loadJobs(db)[job];
  if (!c.on) return [];
  const ready = new Set([...loadSources(db), ...loadShared(db)].filter(isReady).map((s) => s.id));
  return c.order.filter((i) => !c.skip.includes(i) && ready.has(i));
}

/** Checks and saves one job's settings. Returns an error message, or null. */
export function saveJob(db: DB, job: string, b: Record<string, unknown>): string | null {
  if (!(JOBS as readonly string[]).includes(job)) return 'Unknown job.';
  const all = loadJobs(db);
  const cur = all[job as Job];
  const next: JobCfg = { ...cur };
  if (typeof b.on === 'boolean') next.on = b.on;
  const have = ids(db);
  if (b.order !== undefined) {
    if (!Array.isArray(b.order) || b.order.some((i) => typeof i !== 'string' || !have.includes(i)) || new Set(b.order).size !== b.order.length) return 'That order is not valid.';
    next.order = [...(b.order as string[]), ...have.filter((i) => !(b.order as string[]).includes(i))];
  }
  if (b.skip !== undefined) {
    if (!Array.isArray(b.skip) || b.skip.some((i) => typeof i !== 'string' || !have.includes(i))) return 'That list is not valid.';
    next.skip = [...new Set(b.skip as string[])];
  }
  if (have.length && next.order.every((i) => next.skip.includes(i))) return 'At least one provider must stay in use.';
  setSetting(db, 'aiJobs', { ...all, [job]: next });
  return null;
}
