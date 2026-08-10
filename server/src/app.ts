import express from 'express';
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
import { backfillPalettes } from './lib/ingest.js';
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

// Fire-and-forget: catches any photo missing a color-bar palette — either
// uploaded before that feature existed, or (rarely) one whose extraction
// failed at ingest time. Runs once per boot; a large library only pays
// this cost the first time a new server version starts.
backfillPalettes().catch((err) => console.error('Palette backfill crashed:', err.message));

export const app = express();
app.use(express.json());

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
