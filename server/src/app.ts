import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js';
import { photosRouter } from './routes/photos.js';
import { tagsRouter } from './routes/tags.js';
import { ideasRouter } from './routes/ideas.js';
import { discoveryRouter } from './routes/discovery.js';
import { visionProvidersRouter } from './routes/visionProviders.js';
import { filesRouter } from './routes/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.json());

app.use('/api/photos', photosRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/vision-providers', visionProvidersRouter);
app.use('/api', discoveryRouter);
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
