import { bindOwner, OWNER_ID } from './users.js';
import { getSetting, openSecret, setSetting, type DB } from './db.js';
import type { AuthConfig } from './auth.js';
import { friendlyEntries, pathEntries, readFriendly, readPathVars } from './envFlat.js';

/**
 * Settings as an env file. Set Frames up in the app with next to no variables, export everything (secrets included) as one file for
 * the stack, and from then on that file wins: at every start its values are written over what the app had saved.
 *
 * Every server setting is its own plain variable (see envFlat.ts for the names: SHARED_AI_1_ENDPOINT, SHARED_AI_1_KEY, AUTH_1_CLIENT_ID,
 * AUTH_1_KEY, AUTH_ALLOW, and FRAMES_SYSTEM__ names by path for the rest): sign-in, the tunnel, the privacy page, the cloud services'
 * app registrations and the AIs set up for everyone. No one's library is in the file, the owner's included: their AI sources, cloud
 * folders, portfolio and review settings stay in the data volume. Files from an earlier version may still carry the owner's settings
 * (FRAMES_OWNER__ variables, or the older FRAMES_CONFIG_SYSTEM and FRAMES_CONFIG_OWNER JSON objects): those are still read.
 * Other people's libraries are not in the file either.
 *
 * ALLOW_ENV_EXPORT (default true) says whether the file may be downloaded. The file always carries ALLOW_ENV_EXPORT=false, so using
 * it as the stack's env switches the export off again: the secrets cannot be downloaded a second time unless you edit it back.
 */
export const SYSTEM_VAR = 'FRAMES_CONFIG_SYSTEM';
export const OWNER_VAR = 'FRAMES_CONFIG_OWNER';
export const SYSTEM_PREFIX = 'FRAMES_SYSTEM__';
export const OWNER_PREFIX = 'FRAMES_OWNER__';

/** Is any setting of this kind loaded from the environment? (Used to tell people that the env file is in charge.) */
export function envConfigLoaded(env: Record<string, string | undefined> = process.env): { system: boolean; owner: boolean } {
  const any = (legacy: string, prefix: string, scope: 'system' | 'owner') =>
    !!(env[legacy] ?? '').trim() || Object.keys(env).some((k) => k.startsWith(prefix)) || Object.keys(readFriendly(scope, env).values).length + Object.keys(readFriendly(scope, env).patches).length > 0;
  return { system: any(SYSTEM_VAR, SYSTEM_PREFIX, 'system'), owner: any(OWNER_VAR, OWNER_PREFIX, 'owner') };
}

/** Settings that are about what is happening now, not about how Frames is set up. */
const VOLATILE = /^(lastScan(:.*)?|reviewSession|legacyMigrated|tunnelEnvState|accessState|releasesCache|smtpHealth|mailSent|welcomed|gettingStarted|gearMigrated|batchesDone|aiUsage|shareKey|backupCloudStatus|background:\d+)$/;
const KEY = /^[\w:.-]{1,200}$/;
export const isConfigKey = (k: string) => KEY.test(k) && !VOLATILE.test(k);

/**
 * Some settings hold what someone chose next to what Frames recorded about it (when the tunnel was last set up, the last problem, when a
 * cloud folder last synced). Only the choices are carried: the rest is rebuilt by running, so it would be
 * stale in a file, and would show up as a difference from the app that no one could resolve.
 */
const STATE_FIELDS: Record<string, string[]> = {
  tunnel: ['error', 'appliedAt', 'accessNote', 'orgNote', 'dns', 'protectApplied', 'appPublic', 'env'],
};
const CONN_STATE = ['lastSync', 'lastResult', 'needsReconnect'];
/** Writing a file's choices over a setting must not wipe what Frames recorded in it: put the saved state fields back. */
export function keepState(key: string, saved: unknown, next: unknown): unknown {
  if (!next || typeof next !== 'object' || Array.isArray(next) || !saved || typeof saved !== 'object') return next;
  const s = saved as Record<string, unknown>, o = { ...(next as Record<string, unknown>) };
  for (const f of STATE_FIELDS[key] ?? []) if (f in s && !(f in o)) o[f] = s[f];
  if (key === 'cloud' && Array.isArray(o.connections) && Array.isArray(s.connections)) {
    o.connections = o.connections.map((c) => { const was = (s.connections as Record<string, unknown>[]).find((k) => k.id === (c as Record<string, unknown>).id); const k = { ...(c as Record<string, unknown>) }; if (was) for (const f of CONN_STATE) if (f in was && !(f in k)) k[f] = was[f]; return k; });
  }
  return o;
}
/** Is this variable (FRAMES_SYSTEM__key__field) about something Frames records rather than a setting? An older file may still hold some. */
export function isStateVar(name: string): boolean {
  const [, key, field] = name.split('__');
  return !!key && (!isConfigKey(key) || !!(field && STATE_FIELDS[key]?.includes(field)));
}
export function configOnly(key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const o = { ...(value as Record<string, unknown>) };
  for (const f of STATE_FIELDS[key] ?? []) delete o[f];
  if (key === 'cloud' && Array.isArray(o.connections)) o.connections = o.connections.map((c) => { const k = { ...(c as Record<string, unknown>) }; for (const f of CONN_STATE) delete k[f]; return k; });
  return o;
}

/** Every saved setting worth carrying, as a plain object. */
export function snapshot(db: DB): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of db.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[]) {
    if (!isConfigKey(r.key) || (r.key.startsWith('secret:') && r.value === '""')) continue; // nothing to carry for an emptied secret
    try { const v = JSON.parse(r.value); out[r.key] = r.key.startsWith('secret:') ? openSecret(db, v) : configOnly(r.key, v); } catch { /* not ours to export */ }
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
export type EnvItem = { db: DB; scope: 'system' | 'owner'; key: string; value: unknown };
/** What an env file (or the environment) would write: every setting it holds, and anything it could not read. Writes nothing. */
export function collectEnvConfig(sys: DB, ownerDb: DB, env: EnvSource = process.env): { items: EnvItem[]; problems: string[] } {
  const problems: string[] = [];
  const items: EnvItem[] = [];
  for (const [name, prefix, scope, db] of [[SYSTEM_VAR, SYSTEM_PREFIX, 'system', sys], [OWNER_VAR, OWNER_PREFIX, 'owner', ownerDb]] as const) {
    const legacy = readConfigVar(name, env); // the older single JSON variable, if there is one
    if (legacy.problem) problems.push(legacy.problem);
    const byPath = readPathVars(prefix, env, isConfigKey);
    problems.push(...byPath.problems);
    const friendly = readFriendly(scope, env);
    const all: Record<string, unknown> = { ...(legacy.values ?? {}), ...byPath.values, ...friendly.values }; // the later ones win
    // A setting that is partly written as readable variables (the sign-in methods inside auth, the connections inside cloud) is merged
    // onto the rest of it: what the by-path variables say, else what was saved.
    for (const [key, patch] of Object.entries(friendly.patches)) {
      const base = all[key] && typeof all[key] === 'object' && !Array.isArray(all[key]) ? (all[key] as Record<string, unknown>) : getSetting<Record<string, unknown>>(db, key, {});
      all[key] = { ...base, ...patch };
    }
    for (const [k, v] of Object.entries(all)) if (isConfigKey(k)) items.push({ db, scope, key: k, value: configOnly(k, v) });
  }
  return { items, problems };
}

/** At start: write the env file's settings over the saved ones. Returns how many it wrote, and anything it could not read. */
export function applyEnvConfig(sys: DB, ownerDb: DB, env: EnvSource = process.env): { applied: number; problems: string[] } {
  const { items, problems } = collectEnvConfig(sys, ownerDb, env);
  let applied = 0;
  for (const i of items) { setSetting(i.db, i.key, keepState(i.key, getSetting<unknown>(i.db, i.key, null), i.value)); applied++; }
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

const TUNNEL_VARS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TUNNEL_NAME', 'APP_HOSTNAME', 'ACCESS_EMAILS', 'PORTFOLIO_HOSTNAME'];

/** `pairs`, if given, is filled with every variable the file would hold and its value as plain text (for comparing with what is set). */
export const isSecretName = (k: string) => /KEY|SECRET|TOKEN|PASSWORD|AUD|CREDENTIAL|PRIVATE/i.test(k) || /^FRAMES_CONFIG_/.test(k);

/** `secrets: false` writes every secret variable with no value, so the file can be shared. */
export function buildEnvFile(sys: DB, ownerDb: DB, opts: { version?: string; date?: Date; env?: EnvSource; pairs?: [string, string][]; secrets?: boolean } = {}): string {
  const env = opts.env ?? process.env;
  const note = (k: string, t: string) => { opts.pairs?.push([k, t]); return envLine(k, opts.secrets === false && isSecretName(k) ? '' : t); };
  const lines = [
    `# Frames${opts.version && opts.version !== 'dev' ? ` ${opts.version}` : ''} settings${opts.date ? `, exported ${opts.date.toISOString().slice(0, 10)}` : ''}.`,
    '# Add this file to your stack (docker compose --env-file frames.env up -d, or save it as .env next to the compose file, or in Portainer:',
    '# Stack, Environment variables, Load variables from .env file). Its values win over what is saved in the app.',
    '# It holds every secret: keep it private and never commit it.',
    '',
    '# Export is switched off once this file is in use, so the secrets cannot be downloaded again. Set it to true and restart to export again.',
    note('ALLOW_ENV_EXPORT', 'false'),
  ];
  // The Cloudflare API variables belong to the environment-variable setup of the tunnel. When the tunnel is managed from Settings they are
  // left-overs, and carrying them into the file would put them back in charge (a revoked token would then keep the tunnel down).
  const envTunnel = !!getSetting<{ env?: boolean }>(sys, 'tunnel', {}).env;
  const plain = PASS_THROUGH.filter((k) => (env[k] ?? '').trim() && (envTunnel || !TUNNEL_VARS.includes(k)));
  if (plain.length) lines.push('', '# Variables this Frames was started with', ...plain.map((k) => note(k, (env[k] ?? '').trim())));
  const section = (title: string, prefix: string, scope: 'system' | 'owner', settings: Record<string, unknown>) => {
    const { entries, rest } = friendlyEntries(scope, settings);
    lines.push('', `# ${title}`, ...entries.map(([k, t]) => note(k, t)), ...pathEntries(prefix, rest).map(([k, t]) => note(k, t)));
  };
  section('The server’s settings: sign-in, the tunnel, the privacy page, cloud storage providers and the AIs for everyone', SYSTEM_PREFIX, 'system', snapshot(sys));
  return lines.join('\n') + '\n';
}
