import path from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
// Photo libraries are only ever read. Mount them read-only in Docker.
const libraries = (process.env.LIBRARY_DIRS ?? process.env.LIBRARY_DIR ?? './library').split(',').map((s) => path.resolve(s.trim())).filter(Boolean);
const port = Number(process.env.PORT ?? 3000);
const authPassword = process.env.AUTH_PASSWORD || undefined;

const db = openDb(dataDir);
const app = buildApp(db, {
  libraries, dataDir, webDir: process.env.WEB_DIR ?? path.resolve('../web/dist'),
  authPassword, authUser: process.env.AUTH_USER || 'frames',
  // Public host names (for example frames.example.com) when a reverse proxy rewrites the Host header.
  allowedHosts: (process.env.ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).then(() => {
  console.log(`Frames listening on :${port} (libraries: ${libraries.join(', ')}, data: ${dataDir}, login: ${authPassword ? 'on' : 'OFF'})`);
  if (!authPassword) console.warn('No AUTH_PASSWORD set: anyone who can reach this port can use Frames.');
});
// Close the database cleanly when the container stops.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void app.close().then(() => { db.close(); process.exit(0); }); });
