import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';
import { derivPath, processPhoto, type Cfg } from './ingest.js';

/** The previews and thumbnails Frames makes from the originals. Safe to delete: they are made again when a photograph is next opened. */
export const derivDir = (cfg: Cfg) => path.join(cfg.dataDir, 'derivatives');

export function dirBytes(dir: string): number {
  let n = 0;
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size; } } catch { /* a folder that is not there holds nothing */ }
  return n;
}

/**
 * Keeps the cache under `limitBytes` by deleting the previews that were opened longest ago, across every person's library. Thumbnails
 * stay (they are small and every page needs them). Returns how many previews were deleted. Never throws.
 */
export function trimCache(cfgs: Cfg[], limitBytes: number): number {
  if (limitBytes <= 0) return 0;
  try {
    let total = 0;
    const previews: { file: string; size: number; at: number }[] = [];
    for (const c of cfgs) {
      const root = derivDir(c);
      let ids: string[] = [];
      try { ids = fs.readdirSync(root); } catch { continue; }
      for (const id of ids) {
        const dir = path.join(root, id);
        total += dirBytes(dir);
        const f = path.join(dir, 'preview.jpg');
        try { const st = fs.statSync(f); previews.push({ file: f, size: st.size, at: st.mtimeMs }); } catch { /* no preview */ }
      }
    }
    if (total <= limitBytes) return 0;
    previews.sort((a, b) => a.at - b.at);
    let removed = 0;
    for (const p of previews) {
      if (total <= limitBytes) break;
      try { fs.rmSync(p.file, { force: true }); total -= p.size; removed++; } catch { /* leave it */ }
    }
    return removed;
  } catch { return 0; }
}

const making = new Map<string, Promise<boolean>>();
/**
 * A preview or thumbnail that is not on disk (trimmed from the cache, or lost) is made again from the original the first time it is asked
 * for. True when the file is there afterwards. A preview that is served is marked as used, so the cache keeps what is opened often.
 */
export async function ensureDeriv(db: DB, cfg: Cfg, id: number, kind: 'thumb' | 'preview'): Promise<boolean> {
  const f = derivPath(cfg, id, kind);
  if (fs.existsSync(f)) { if (kind === 'preview') { const now = new Date(); fs.utimes(f, now, now, () => undefined); } return true; }
  const row = db.prepare('SELECT path FROM photos WHERE id = ? AND missing = 0').get(id) as { path: string } | undefined;
  if (!row || !fs.existsSync(row.path)) return false;
  const key = `${cfg.dataDir}:${id}`;
  let p = making.get(key);
  if (!p) { p = processPhoto(db, cfg, id, row.path).catch(() => false).finally(() => making.delete(key)); making.set(key, p); }
  await p;
  return fs.existsSync(f);
}

/** Once a minute after start-up, then hourly: trim the cache to the limit. */
export function startCacheTrim(targets: () => { cfgs: Cfg[]; limitGb: number }) {
  const run = () => { try { const t = targets(); const n = trimCache(t.cfgs, t.limitGb * 1073741824); if (n) console.log(`Cache over its limit: ${n} preview${n === 1 ? '' : 's'} deleted (they are made again when opened).`); } catch (e) { console.error('Cache trim failed', e); } };
  setTimeout(run, 60_000).unref();
  setInterval(run, 3600_000).unref();
}
