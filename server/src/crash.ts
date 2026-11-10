import os from 'node:os';

/**
 * Optional, off by default, and only possible when the person running the server has said where reports go (CRASH_REPORT_URL).
 * When an administrator turns it on, a crash sends one small JSON message there: the version, the kind of crash, the error text and the
 * top of its stack, with file paths cut to their last part and anything that looks like an email address or a secret removed.
 * No photographs, names, library paths or settings are included. At most a few are sent an hour, and the same one is not repeated.
 */
export const crashUrl = (env: Record<string, string | undefined> = process.env): string => {
  const u = (env.CRASH_REPORT_URL ?? '').trim();
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? u : ''; } catch { return ''; }
};
export const crashHost = (env: Record<string, string | undefined> = process.env): string => { try { return new URL(crashUrl(env)).host; } catch { return ''; } };

/** Cuts a message or stack down to what is safe to send. */
export function scrub(text: string): string {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[^\s:()'"\\/]+[\\/])+([^\s:()'"\\/]+)/g, '$1') // a path becomes its last part
    .slice(0, 2000);
}

export function buildReport(err: unknown, kind: string, version: string) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    app: 'frames', version, kind, at: new Date().toISOString(), node: process.version, platform: `${os.platform()}-${os.arch()}`,
    message: scrub(e.message),
    stack: scrub((e.stack ?? '').split('\n').slice(0, 9).join('\n')),
  };
}

const sent: { key: string; at: number }[] = [];
export const MAX_PER_HOUR = 3;
/** Sends one report if allowed. Never throws; resolves to whether one was sent. */
export async function reportCrash(err: unknown, kind: string, opts: { enabled: boolean; version: string; env?: Record<string, string | undefined>; now?: number; fetcher?: typeof fetch }): Promise<boolean> {
  try {
    const url = crashUrl(opts.env);
    if (!opts.enabled || !url) return false;
    const now = opts.now ?? Date.now();
    const report = buildReport(err, kind, opts.version);
    const key = `${report.kind}:${report.message}`;
    const recent = sent.filter((s) => now - s.at < 3_600_000);
    sent.length = 0; sent.push(...recent);
    if (recent.length >= MAX_PER_HOUR || recent.some((s) => s.key === key)) return false;
    sent.push({ key, at: now });
    const r = await (opts.fetcher ?? fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Frames' }, body: JSON.stringify(report), signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
}

/** What to do when the server cannot go on: say so in the log, send a report if allowed, and stop (the container restarts it). */
export function installCrashHandlers(opts: { enabled: () => boolean; version: string }) {
  const die = (e: unknown, kind: string) => {
    console.error(kind, e);
    void Promise.race([reportCrash(e, kind, { enabled: opts.enabled(), version: opts.version }), new Promise((r) => setTimeout(r, 3000))]).finally(() => process.exit(1));
  };
  process.on('uncaughtException', (e) => die(e, 'uncaughtException'));
  process.on('unhandledRejection', (e) => die(e, 'unhandledRejection'));
}
