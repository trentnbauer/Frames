import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db.js';
import type { Ctx, Row } from '../ctx.js';

/**
 * A picture of a room behind a composition, to see how the prints would look on the wall (Composition editor). It belongs to the
 * person's own data (a re-encoded JPEG in their data folder), is served only to them, and is never part of a share link or the portfolio.
 */
const MAX_BYTES = 8_000_000; // of the data URL as sent; the page shrinks the picture first
const SIDE = 2000;
export const backgroundFile = (dataDir: string, id: number) => path.join(dataDir, 'backgrounds', `${id}.jpg`);
export type Background = { w: number; h: number; v: number };
export const backgroundOf = (db: Ctx['db'], id: number): Background | null => getSetting<Background | null>(db, `background:${id}`, null);

export function registerBackground(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, one } = x;
  const exists = (id: number) => !!one('SELECT 1 x FROM collections WHERE id = ?', id);

  app.put('/api/collections/:id/background', { bodyLimit: MAX_BYTES + 1000 }, async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!exists(id)) return x.notFound(rep);
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(((req.body ?? {}) as Row).image ?? ''));
    if (!m || m[1].length > MAX_BYTES) return rep.code(400).send({ error: 'Choose a JPEG, PNG or WebP picture, up to about 6 MB.' });
    try {
      const { data, info } = await sharp(Buffer.from(m[1], 'base64'), { limitInputPixels: 80_000_000 }).rotate().resize(SIDE, SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const file = backgroundFile(cfg.dataDir, id);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
      setSetting(db, `background:${id}`, { w: info.width, h: info.height, v: Date.now() } satisfies Background);
    } catch { return rep.code(400).send({ error: 'That file could not be read as a picture.' }); }
    return { background: backgroundOf(db, id) };
  });

  app.get('/api/collections/:id/background', async (req, rep) => {
    const id = num((req.params as Row).id);
    const f = backgroundFile(cfg.dataDir, id);
    if (!exists(id) || !fs.existsSync(f)) return x.notFound(rep, 'No picture');
    return rep.type('image/jpeg').header('Cache-Control', 'private, max-age=3600').send(fs.readFileSync(f));
  });

  app.delete('/api/collections/:id/background', async (req) => {
    const id = num((req.params as Row).id);
    removeBackground(db, cfg.dataDir, id);
    return { background: null };
  });
}

export function removeBackground(db: Ctx['db'], dataDir: string, id: number) {
  fs.rmSync(backgroundFile(dataDir, id), { force: true });
  db.prepare('DELETE FROM settings WHERE key = ?').run(`background:${id}`);
}
