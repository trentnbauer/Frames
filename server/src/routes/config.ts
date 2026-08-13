import { Router } from 'express';

export const configRouter = Router();

// Public, read-only defaults sourced from container env vars — lets a
// docker-compose deployment set Google Drive / Dropbox app credentials
// once instead of every viewer typing them into Settings. These are public
// client identifiers (not secrets), same reasoning as why they're stored in
// localStorage on the frontend; a value the user types in Settings still
// overrides whatever's here (see web/src/importConfig.ts).
configRouter.get('/', (_req, res) => {
  const socialHandles = (process.env.SOCIAL_HANDLES || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  res.json({
    googleDrive:
      process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLIENT_ID
        ? { apiKey: process.env.GOOGLE_API_KEY || '', clientId: process.env.GOOGLE_CLIENT_ID || '' }
        : null,
    dropbox: process.env.DROPBOX_APP_KEY ? { appKey: process.env.DROPBOX_APP_KEY } : null,
    socialHandles: socialHandles.length ? socialHandles : null,
    watchFolder: process.env.WATCH_DIR || null,
  });
});
