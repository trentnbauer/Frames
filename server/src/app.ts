import express from 'express';
// Express 4 does not catch a rejected promise thrown inside an async route
// handler — it becomes an unhandled rejection, which crashes the whole
// process (verified live: uploading one non-image file to /api/photos/upload
// took the entire server down, not just that request). This patches
// Express's router so those errors route to the error-handling middleware
// below like any other error, instead of killing the process. Side-effect
// import — must run before any router/route is defined.
import 'express-async-errors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// Node's happy-eyeballs autoSelectFamily (on by default since Node 20) races
// IPv4 and IPv6 connection attempts for outbound fetch() calls. On networks
// without a working IPv6 route (common in Docker's default bridge network,
// and in this dev sandbox), the race can fail outright instead of falling
// back to the working IPv4 address — breaking the weather lookup. Disabling
// it makes outbound requests use plain, sequential DNS resolution.
net.setDefaultAutoSelectFamily(false);
import './db.js';
import { seedProvidersFromEnv } from './lib/envProviders.js';
import { backfillDerivedFields } from './lib/ingest.js';
import { startWatchFolder } from './lib/watchFolder.js';
import { photosRouter } from './routes/photos.js';
import { tagsRouter } from './routes/tags.js';
import { ideasRouter } from './routes/ideas.js';
import { discoveryRouter } from './routes/discovery.js';
import { visionProvidersRouter } from './routes/visionProviders.js';
import { filesRouter } from './routes/files.js';
import { configRouter } from './routes/config.js';
import { backupRouter } from './routes/backup.js';
import { weatherRouter } from './routes/weather.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

seedProvidersFromEnv();

// Fire-and-forget: catches any photo missing a color-bar palette or
// near-duplicate hash — either uploaded before those features existed, or
// (rarely) one whose extraction failed at ingest time. Runs once per boot;
// a large library only pays this cost the first time a new server version
// starts.
backfillDerivedFields().catch((err) => console.error('Derived-field backfill crashed:', err.message));

// Opt-in: only starts if FRAMES_WATCH_DIR points at an existing directory,
// so self-hosters who don't want it pay nothing.
const watchDir = process.env.FRAMES_WATCH_DIR;
if (watchDir && fs.existsSync(watchDir)) {
  startWatchFolder(watchDir);
} else if (watchDir) {
  console.error(`FRAMES_WATCH_DIR is set to "${watchDir}" but that directory doesn't exist — watch folder not started.`);
}

export const app = express();
app.use(express.json());

// This is a self-hosted, single-/few-user tool, not a public multi-tenant
// service — the ceiling here exists to satisfy "every route reachable
// without a rate limiter is a DoS risk" (a real class of bug in general,
// and one every handler below was flagged for) rather than to defend
// against real abuse, so it's set generous: a Library grid page alone can
// fire 100+ /files/thumb requests on a single load.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 3000, standardHeaders: true, legacyHeaders: false }));

app.use('/api/photos', photosRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/vision-providers', visionProvidersRouter);
app.use('/api', discoveryRouter);
app.use('/api/config', configRouter);
app.use('/api/backup', backupRouter);
app.use('/api/weather', weatherRouter);
app.use('/files', filesRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/files')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});
