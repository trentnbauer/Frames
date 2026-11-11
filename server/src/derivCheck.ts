import { waitIdle } from './activity.js';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { dHash, hamming } from './analysis.js';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, rebuild, type Cfg } from './ingest.js';

/**
 * Do the preview and thumbnail files really belong to the photographs they are filed under? They are kept by photograph number, so
 * if the database and the files ever fall out of step (a restored database, files copied from another instance, a crash half way
 * through a rebuild) a number would show another photograph's picture. Each photograph's difference hash was taken from its thumbnail
 * when it was made, so a thumbnail that no longer matches it, or a preview that does not look like its thumbnail, is somebody else's.
 * Those are thrown away and made again from the originals. Nothing is lost: the originals are never touched.
 */
/** A picture as 16 by 16 grey squares, to tell whether two files look alike by how much their brightness differs, not by which neighbour is brighter. */
const grid = (f: string) => sharp(f, { failOn: 'none' }).rotate().resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
const meanDiff = (a: Buffer, b: Buffer) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/**
 * `who` names whose library this is, for the log. A photograph that has been reported and made again before is made again quietly if it
 * is found again, so the same few do not raise the same warning at every start.
 */
export async function verifyDerivatives(db: DB, cfg: Cfg, who = ''): Promise<{ checked: number; wrong: number; rebuilt: number }> {
  const rows = db.prepare('SELECT id, dhash FROM photos WHERE has_derivs = 1 AND missing = 0 AND dhash IS NOT NULL').all() as { id: number; dhash: string }[];
  const wrong: number[] = [];
  for (const r of rows) {
    const thumb = derivPath(cfg, r.id, 'thumb'), preview = derivPath(cfg, r.id, 'preview');
    try {
      if (!fs.existsSync(thumb)) { wrong.push(r.id); continue; }
      const t = await dHash(thumb);
      // A preview the cache limit removed is not wrong: it is made again when the photograph is opened.
      // The preview must differ from the thumbnail both in the hash AND in brightness. Two sizes of the same portrait photograph can differ by 20 hash bits (seen on real photos) while their brightness differs by under 6 on a 0 to 255 scale; a different photograph differs by 40 or more. A flat or dark picture can flip many hash bits
      // between two sizes of the same file while looking exactly alike.
      if (hamming(t, r.dhash) > 4 || (fs.existsSync(preview) && hamming(await dHash(preview), t) > 10 && meanDiff(await grid(preview), await grid(thumb)) > 15)) wrong.push(r.id);
    } catch { wrong.push(r.id); } // a file that cannot be read is no good either
  }
  for (const id of wrong) {
    db.prepare('UPDATE photos SET has_derivs = 0, dhash = NULL WHERE id = ?').run(id);
    fs.rmSync(path.dirname(derivPath(cfg, id, 'thumb')), { recursive: true, force: true });
  }
  let rebuilt = 0;
  if (wrong.length) {
    const told = getSetting<Record<string, string>>(db, 'derivCheckTold', {});
    const hashOf = new Map((db.prepare(`SELECT id, hash FROM photos WHERE id IN (${wrong.map(() => '?').join(',')})`).all(...wrong) as { id: number; hash: string }[]).map((p) => [p.id, p.hash]));
    const fresh = wrong.filter((id) => told[id] !== hashOf.get(id)); // not reported before (or the file has changed since)
    if (fresh.length) {
      console.warn(`${fresh.length} preview${fresh.length === 1 ? '' : 's'} did not match ${fresh.length === 1 ? 'its' : 'their'} photograph${fresh.length === 1 ? '' : 's'}${who ? ` in ${who}’s library` : ''} (photograph ${fresh.slice(0, 8).join(', ')}${fresh.length > 8 ? ', …' : ''}): rebuilding from the originals.`);
      for (const id of fresh) told[id] = hashOf.get(id) ?? '';
      setSetting(db, 'derivCheckTold', told);
    }
    rebuilt = (await rebuild(db, cfg, false, undefined, () => waitIdle(db))).rebuilt;
  }
  return { checked: rows.length, wrong: wrong.length, rebuilt };
}

/** Once shortly after start-up (so a restore or a copied data folder is put right at once), then daily. Never throws. */
export function startDerivativeCheck(targets: () => { db: DB; cfg: Cfg; user?: { name?: string; email?: string } }[]) {
  const run = () => { for (const t of targets()) verifyDerivatives(t.db, t.cfg, t.user?.name || t.user?.email || '').catch((e) => console.error('Preview check failed', e)); };
  setTimeout(run, 20_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
