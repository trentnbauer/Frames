import type { DB } from './db.js';
import { policyOf } from './policy.js';

/**
 * "Heavy jobs run: when idle". People using Frames come first: automatic analysis (AI tagging, remaking previews after a check) waits
 * until nobody has used the app for a while. Requests that only poll for progress do not count as use.
 */
let lastUse = 0;
export const IDLE_MS = 5 * 60_000;
const POLL = /^\/api\/(health|ai\/status|library\/(scan|rebuild)\/status|notifications|config\/status|me\b|admin\/(system|logs\/info))/;
export const noteUse = (url: string) => { if (url.startsWith('/api/') && !POLL.test(url)) lastUse = Date.now(); };
export const idleFor = () => Date.now() - lastUse;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Resolves at once when heavy jobs may always run; otherwise when the app has been idle for IDLE_MS. */
export async function waitIdle(db: DB, opts: { idleMs?: number; pollMs?: number } = {}): Promise<void> {
  const sys = (db as unknown as { sys?: DB }).sys;
  if (!sys) return;
  for (;;) {
    const mode = policyOf(sys).heavyJobs;
    const quiet = mode === 'always' || (mode === 'idle' && idleFor() >= (opts.idleMs ?? IDLE_MS)) || (mode === 'overnight' && new Date().getHours() >= 1 && new Date().getHours() < 6);
    if (quiet) return;
    await sleep(opts.pollMs ?? 15_000);
  }
}
