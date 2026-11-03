import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.js';
import { oauthEnabled } from './auth.js';
import { integrity, startAutoBackup } from './backup.js';
import { openDb, type DB } from './db.js';
import { internalDir } from './ingest.js';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
// Photo libraries are only ever read. Mount them read-only in Docker.
const external = (process.env.LIBRARY_DIRS ?? process.env.LIBRARY_DIR ?? './library').split(',').map((s) => path.resolve(s.trim())).filter(Boolean);
// Plus Frames' own folder, where uploaded photographs live (internally managed storage).
const libraries = [...external, internalDir({ libraries: [], dataDir })];
const port = Number(process.env.PORT ?? 3000);
const authPassword = process.env.AUTH_PASSWORD || undefined;

// Everything Frames keeps (databases, uploads, previews) lives here, so say so plainly if it cannot be written.
try { fs.mkdirSync(dataDir, { recursive: true }); fs.accessSync(dataDir, fs.constants.W_OK); } catch (e) {
  console.error(`CANNOT WRITE TO THE DATA FOLDER ${dataDir} (${(e as NodeJS.ErrnoException).code}). Frames runs as an unprivileged user (uid ${process.getuid?.()}): the folder or volume must be writable by it. For a bind mount: chown it to that user. For a named volume that was created by something else (for example as root): remove it or fix its ownership.`);
}
const db = openDb(dataDir);
const check = integrity(db);
if (check !== 'ok') console.error(`DATABASE PROBLEM: ${check}. Restore from a backup in ${path.join(dataDir, 'backups')} (see the README).`);
const app = buildApp(db, {
  libraries, dataDir,
  // Each person's own library is a folder under these (Settings, Users): /library/<their folder>.
  libraryRoots: external,
  // ALLOW_SIGNUPS=0: only people an administrator has added (or who already have an account) can sign in.
  allowSignups: !['0', 'false', 'no', 'off'].includes((process.env.ALLOW_SIGNUPS ?? '').toLowerCase()), webDir: process.env.WEB_DIR ?? path.resolve('../web/dist'),
  version: process.env.APP_VERSION || 'dev',
  trustProxy: process.env.TRUST_PROXY === '1',
  // Break-glass: switches every sign-in off, so a misconfigured provider can never lock the owner out.
  authDisabled: process.env.AUTH_DISABLE === '1',
  // Only for an OIDC server on a trusted plain-http network (its secrets then cross it unencrypted).
  allowInsecureOidc: process.env.OIDC_ALLOW_HTTP === '1',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || undefined,
  authPassword, authUser: process.env.AUTH_USER || 'frames',
  // Public host names (for example frames.example.com) when a reverse proxy rewrites the Host header.
  allowedHosts: (process.env.ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
const frames = (app as any).frames as { sys: DB; tenants: { all(): { db: DB; cfg: { dataDir: string } }[] } };
startAutoBackup(() => [...frames.tenants.all().map((t) => ({ db: t.db, dataDir: t.cfg.dataDir })), { db: frames.sys, dataDir: path.join(dataDir, 'system') }]);
app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).then(() => {
  console.log(`Frames listening on :${port} (libraries: ${libraries.join(', ')}, data: ${dataDir}, login: ${process.env.AUTH_DISABLE === '1' ? 'DISABLED' : [authPassword && 'password', oauthEnabled(frames.sys) && 'oauth'].filter(Boolean).join('+') || 'OFF'})`);
  if (process.env.AUTH_DISABLE === '1') console.warn('AUTH_DISABLE=1: ALL sign-in is switched off. Anyone who can reach this port can use Frames.');
  else if (!authPassword && !oauthEnabled(frames.sys)) console.warn('No sign-in is set up: anyone who can reach this port can use Frames. Set AUTH_PASSWORD or add an OAuth provider in Settings, Access.');
}).catch((e) => {
  console.error(`Could not start on port ${port}: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
// Close the database cleanly when the container stops.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void app.close().then(() => { db.close(); process.exit(0); }); });
