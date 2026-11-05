import fs from 'node:fs';
import path from 'node:path';
import { dHash, hamming } from './analysis.js';
import type { DB } from './db.js';
import { derivPath, rebuild, type Cfg } from './ingest.js';

/**
 * Do the preview and thumbnail files really belong to the photographs they are filed under? They are kept by photograph number, so
 * if the database and the files ever fall out of step (a restored database, files copied from another instance, a crash half way
 * through a rebuild) a number would show another photograph's picture. Each photograph's difference hash was taken from its thumbnail
 * when it was made, so a thumbnail that no longer matches it, or a preview that does not look like its thumbnail, is somebody else's.
 * Those are thrown away and made again from the originals. Nothing is lost: the originals are never touched.
 */
export async function verifyDerivatives(db: DB, cfg: Cfg): Promise<{ checked: number; wrong: number; rebuilt: number }> {
  const rows = db.prepare('SELECT id, dhash FROM photos WHERE has_derivs = 1 AND missing = 0 AND dhash IS NOT NULL').all() as { id: number; dhash: string }[];
  const wrong: number[] = [];
  for (const r of rows) {
    const thumb = derivPath(cfg, r.id, 'thumb'), preview = derivPath(cfg, r.id, 'preview');
    try {
      if (!fs.existsSync(thumb) || !fs.existsSync(preview)) { wrong.push(r.id); continue; }
      const t = await dHash(thumb);
      if (hamming(t, r.dhash) > 4 || hamming(await dHash(preview), t) > 10) wrong.push(r.id);
    } catch { wrong.push(r.id); } // a file that cannot be read is no good either
  }
  for (const id of wrong) {
    db.prepare('UPDATE photos SET has_derivs = 0, dhash = NULL WHERE id = ?').run(id);
    fs.rmSync(path.dirname(derivPath(cfg, id, 'thumb')), { recursive: true, force: true });
  }
  let rebuilt = 0;
  if (wrong.length) {
    console.warn(`${wrong.length} preview${wrong.length === 1 ? '' : 's'} did not match ${wrong.length === 1 ? 'its' : 'their'} photograph${wrong.length === 1 ? '' : 's'} (photograph ${wrong.slice(0, 8).join(', ')}${wrong.length > 8 ? ', …' : ''}): rebuilding from the originals.`);
    rebuilt = (await rebuild(db, cfg, false)).rebuilt;
  }
  return { checked: rows.length, wrong: wrong.length, rebuilt };
}

/** Once shortly after start-up (so a restore or a copied data folder is put right at once), then daily. Never throws. */
export function startDerivativeCheck(targets: () => { db: DB; cfg: Cfg }[]) {
  const run = () => { for (const t of targets()) verifyDerivatives(t.db, t.cfg).catch((e) => console.error('Preview check failed', e)); };
  setTimeout(run, 20_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
