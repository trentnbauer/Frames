import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

/**
 * What the server says about itself (start-up lines, warnings, errors) is printed as before and also kept in a file in the data folder,
 * so an administrator can download it. The level, set under Settings, Server, Updates & system, decides what is kept at all:
 * errors only, warnings and errors, or everything. The file is cut at 5 MB and the last two are kept (about the last week on a quiet server).
 */
const RANK = { errors: 0, warnings: 1, info: 2, debug: 3 } as const;
export type LogLevel = keyof typeof RANK;
const MAX = 5 * 1024 * 1024;

let level: LogLevel = 'info';
let file = '';
let started = false;
export const setLogLevel = (l: LogLevel) => { level = l; };
export const logFile = () => file;

function write(tag: string, args: unknown[]) {
  if (!file) return;
  try {
    const line = `${new Date().toISOString()} ${tag} ${util.format(...args).replace(/\n/g, '\n    ')}\n`;
    try { if (fs.statSync(file).size > MAX) { fs.rmSync(file + '.1', { force: true }); fs.renameSync(file, file + '.1'); } } catch { /* no file yet */ }
    fs.appendFileSync(file, line);
  } catch { /* the log must never stop the server */ }
}

/** Idempotent. Call once the data folder is known. */
export function startLogger(dataDir: string, initial: LogLevel = 'info') {
  level = initial;
  file = path.join(dataDir, 'logs', 'frames.log');
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch { file = ''; }
  if (started) return;
  started = true;
  const real = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
  const wrap = (name: keyof typeof real, tag: string, rank: number) => {
    (console as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      if (rank > RANK[level]) return; // above the chosen level: neither shown nor kept
      real[name](...args);
      write(tag, args);
    };
  };
  wrap('log', 'INFO', 2); wrap('info', 'INFO', 2); wrap('debug', 'DEBUG', 3); wrap('warn', 'WARN', 1); wrap('error', 'ERROR', 0);
}

/** The kept log, oldest first, from the last `days` days (lines that start with a date; a continuation stays with its line). */
export function readLog(days = 7): { text: string; bytes: number } {
  if (!file) return { text: '', bytes: 0 };
  const cut = Date.now() - days * 86_400_000;
  let text = '';
  for (const f of [file + '.1', file]) { try { text += fs.readFileSync(f, 'utf8'); } catch { /* none */ } }
  let keep = false;
  const out: string[] = [];
  for (const l of text.split('\n')) { const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) /.exec(l); if (m) keep = Date.parse(m[1]) >= cut; if (keep) out.push(l); }
  const body = out.join('\n');
  return { text: body, bytes: Buffer.byteLength(body) };
}
