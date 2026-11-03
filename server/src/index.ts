import path from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
// Photo libraries are only ever read. Mount them read-only in Docker.
const libraries = (process.env.LIBRARY_DIRS ?? process.env.LIBRARY_DIR ?? './library').split(',').map((s) => path.resolve(s.trim())).filter(Boolean);
const port = Number(process.env.PORT ?? 3000);

const db = openDb(dataDir);
const app = buildApp(db, { libraries, dataDir, webDir: process.env.WEB_DIR ?? path.resolve('../web/dist') });
app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).then(() => console.log(`Frames listening on :${port} (libraries: ${libraries.join(', ')}, data: ${dataDir})`));
