import { Router } from 'express';

export const configRouter = Router();

// Public, read-only defaults sourced from container env vars — lets a
// docker-compose deployment set Google Drive / Dropbox app credentials
// once instead of every viewer typing them into Settings. These are public
// client identifiers (not secrets), same reasoning as why they're stored in
// localStorage on the frontend; a value the user types in Settings still
// overrides whatever's here (see web/src/importConfig.ts).
configRouter.get('/', (_req, res) => {
  res.json({
    googleDrive:
      process.env.FRAMES_GOOGLE_API_KEY || process.env.FRAMES_GOOGLE_CLIENT_ID
        ? { apiKey: process.env.FRAMES_GOOGLE_API_KEY || '', clientId: process.env.FRAMES_GOOGLE_CLIENT_ID || '' }
        : null,
    dropbox: process.env.FRAMES_DROPBOX_APP_KEY ? { appKey: process.env.FRAMES_DROPBOX_APP_KEY } : null,
  });
});
