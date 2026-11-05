import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type DB } from '../db.js';
import type { Ctx, Row } from '../ctx.js';

/**
 * A person's profile: the name and picture that stand for them, and that their portfolio shows.
 * They are the person's own and are not overwritten by what the sign-in provider says (which refreshes the account name on every sign-in).
 */
export const displayNameOf = (db: DB): string => String(getSetting<{ displayName?: string }>(db, 'profile', {}).displayName ?? '');
export const avatarPath = (dataDir: string) => path.join(dataDir, 'avatar.jpg');

const MAX_IMAGE = 3_000_000; // bytes of the picture as sent; the browser shrinks it first, this only stops abuse

export function registerProfile(app: FastifyInstance, x: Ctx) {
  const { db, cfg } = x;
  const state = (req: any) => {
    const u = req.authUser as { name?: string; email?: string } | null;
    return { displayName: displayNameOf(db), hasAvatar: fs.existsSync(avatarPath(cfg.dataDir)), signedInAs: u ? (u.name || u.email || '') : '' };
  };

  app.get('/api/profile', async (req) => state(req));
  app.put('/api/profile', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    if (b.displayName !== undefined) {
      if (typeof b.displayName !== 'string') return rep.code(400).send({ error: 'The name must be text.' });
      setSetting(db, 'profile', { ...getSetting<Row>(db, 'profile', {}), displayName: b.displayName.trim().slice(0, 80) });
    }
    return state(req);
  });

  // The picture arrives as a data URL (the page makes it small first); it is decoded and re-encoded here as a square JPEG, so only an image is ever kept.
  app.put('/api/profile/avatar', async (req, rep) => {
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(((req.body ?? {}) as Row).image ?? ''));
    if (!m || m[1].length > MAX_IMAGE * 1.4) return rep.code(400).send({ error: 'Choose a JPEG, PNG or WebP picture.' });
    try {
      const out = await sharp(Buffer.from(m[1], 'base64'), { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
      fs.mkdirSync(cfg.dataDir, { recursive: true });
      fs.writeFileSync(avatarPath(cfg.dataDir), out);
    } catch { return rep.code(400).send({ error: 'That file could not be read as a picture.' }); }
    return state(req);
  });
  app.delete('/api/profile/avatar', async (req) => { fs.rmSync(avatarPath(cfg.dataDir), { force: true }); return state(req); });
  app.get('/api/profile/avatar', async (_req, rep) => {
    const f = avatarPath(cfg.dataDir);
    if (!fs.existsSync(f)) return rep.code(404).send({ error: 'No picture' });
    return rep.type('image/jpeg').header('Cache-Control', 'no-cache').send(fs.readFileSync(f));
  });
}
