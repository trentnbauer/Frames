import { bindOwner, OWNER_ID } from './users.js';
import { getSetting, setSetting, type DB } from './db.js';
import type { AuthConfig } from './auth.js';

/**
 * Settings as an env file. Set Frames up in the app with next to no variables, export everything (secrets included) as one file for
 * the stack, and from then on that file wins: at every start its values are written over what the app had saved.
 *
 * The settings travel in two variables, FRAMES_CONFIG_SYSTEM (sign-in providers, the allow-list, the tunnel, the privacy page) and
 * FRAMES_CONFIG_OWNER (the owner's library: AI sources and their keys, cloud accounts, the portfolio, review settings), each a JSON
 * object of setting name to value. Other people's libraries are not in the file: their data lives in the data volume.
 *
 * ALLOW_ENV_EXPORT (default true) says whether the file may be downloaded. The file always carries ALLOW_ENV_EXPORT=false, so using
 * it as the stack's env switches the export off again: the secrets cannot be downloaded a second time unless you edit it back.
 */
export const SYSTEM_VAR = 'FRAMES_CONFIG_SYSTEM';
export const OWNER_VAR = 'FRAMES_CONFIG_OWNER';

/** Settings that are about what is happening now, not about how Frames is set up. */
const VOLATILE = /^(lastScan(:.*)?|reviewSession|legacyMigrated|tunnelEnvState|accessState)$/;
const KEY = /^[\w:.-]{1,200}$/;
export const isConfigKey = (k: string) => KEY.test(k) && !VOLATILE.test(k);

/** Every saved setting worth carrying, as a plain object. */
export function snapshot(db: DB): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of db.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[]) {
    if (!isConfigKey(r.key)) continue;
    try { out[r.key] = JSON.parse(r.value); } catch { /* not ours to export */ }
  }
  return out;
}

export type EnvSource = Record<string, string | undefined>;

/** The env file's own copy of the settings, parsed. A value that is not a JSON object is reported, not guessed at. */
export function readConfigVar(name: string, env: EnvSource = process.env): { values: Record<string, unknown> | null; problem: string | null } {
  const raw = (env[name] ?? '').trim();
  if (!raw) return { values: null, problem: null };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return { values: v as Record<string, unknown>, problem: null };
  } catch { return { values: null, problem: `${name} is not valid JSON (an object of setting names and values), so it was ignored.` }; }
}

/** At start: write the env file's settings over the saved ones. Returns how many it wrote, and anything it could not read. */
export function applyEnvConfig(sys: DB, ownerDb: DB, env: EnvSource = process.env): { applied: number; problems: string[] } {
  const problems: string[] = [];
  let applied = 0;
  for (const [name, db] of [[SYSTEM_VAR, sys], [OWNER_VAR, ownerDb]] as const) {
    const r = readConfigVar(name, env);
    if (r.problem) problems.push(r.problem);
    for (const [k, v] of Object.entries(r.values ?? {})) { if (isConfigKey(k)) { setSetting(db, k, v); applied++; } }
  }
  if (applied) {
    // What other parts keep in step with these settings: who the owner is, and which hostname is whose.
    const auth = getSetting<Partial<AuthConfig>>(sys, 'auth', {});
    if (auth.testedBy) bindOwner(sys, { ...auth.testedBy, emailVerified: true });
    const host = (getSetting<{ host?: string }>(ownerDb, 'portfolio', {}).host ?? '').toLowerCase();
    if (host) {
      sys.prepare('DELETE FROM portfolio_hosts WHERE user_id = ?').run(OWNER_ID);
      sys.prepare('INSERT OR REPLACE INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run(host, OWNER_ID);
    }
  }
  return { applied, problems };
}

/** One KEY=value line, quoted only when Docker Compose could misread it (single quotes: nothing inside is interpolated). */
export function envLine(key: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${key} cannot contain a line break`);
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(value)) return `${key}=${value}`;
  if (!value.includes("'")) return `${key}='${value}'`;
  return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '$$$$')}"`;
}

/** Plain variables the container was started with, carried over as they are. (The host side, such as the photo folder, is not visible here.) */
const PASS_THROUGH = ['AUTH_DISABLE', 'AUTH_USER', 'AUTH_PASSWORD', 'ALLOW_SIGNUPS', 'SESSION_DAYS', 'OIDC_ALLOW_HTTP', 'MAX_UPLOAD_MB', 'TRUST_PROXY', 'ALLOWED_HOSTS',
  'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TUNNEL_NAME', 'APP_HOSTNAME', 'ACCESS_EMAILS', 'PORTFOLIO_HOSTNAME'];

export function buildEnvFile(sys: DB, ownerDb: DB, opts: { version?: string; date?: Date; env?: EnvSource } = {}): string {
  const env = opts.env ?? process.env;
  const lines = [
    `# Frames${opts.version && opts.version !== 'dev' ? ` ${opts.version}` : ''} settings${opts.date ? `, exported ${opts.date.toISOString().slice(0, 10)}` : ''}.`,
    '# Add this file to your stack (docker compose --env-file frames.env up -d, or save it as .env next to the compose file, or in Portainer:',
    '# Stack, Environment variables, Load variables from .env file). Its values win over what is saved in the app.',
    '# It holds every secret: keep it private and never commit it.',
    '',
    '# Export is switched off once this file is in use, so the secrets cannot be downloaded again. Set it to true and restart to export again.',
    envLine('ALLOW_ENV_EXPORT', 'false'),
  ];
  const plain = PASS_THROUGH.filter((k) => (env[k] ?? '').trim());
  if (plain.length) lines.push('', '# Variables this Frames was started with', ...plain.map((k) => envLine(k, (env[k] ?? '').trim())));
  lines.push('', '# The settings saved in the app (JSON): sign-in, the tunnel and the privacy page', envLine(SYSTEM_VAR, JSON.stringify(snapshot(sys))));
  lines.push('', '# The owner’s library settings (JSON): AI sources and keys, cloud accounts, the portfolio and review settings', envLine(OWNER_VAR, JSON.stringify(snapshot(ownerDb))));
  return lines.join('\n') + '\n';
}
