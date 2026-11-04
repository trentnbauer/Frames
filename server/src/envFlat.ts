/**
 * Settings as plain environment variables.
 *
 * Only the server's own settings are written to the file, never anyone's library (the owner's AIs, cloud folders and portfolio stay in
 * the data volume). Things that come as a list get numbered, readable names (the first AI for everyone is SHARED_AI_1_ENDPOINT,
 * SHARED_AI_1_MODEL, SHARED_AI_1_KEY; the first sign-in method AUTH_1_TYPE, AUTH_1_CLIENT_ID, AUTH_1_KEY), plus AUTH_ENABLED, AUTH_ALLOW
 * (comma separated), AUTH_PUBLIC_URL and CLOUD_GOOGLE_CLIENT_ID / CLOUD_GOOGLE_CLIENT_SECRET (and DROPBOX, ONEDRIVE).
 * Every other server setting is written by path, FRAMES_SYSTEM__<setting>__<step>__<step>, where a character that is not a letter or
 * digit is written _xHH_ so a double underscore only ever means one step down, and a list is steps 0, 1, 2. (A file from an earlier
 * version may still carry FRAMES_OWNER__ variables: they are read, not written.)
 *
 * A value that would be read as something other than the text it is (true, 12, null, [], a line break) is wrapped in double quotes.
 */

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const camel = (s: string) => s.toLowerCase().replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

// ---------- a value as the text of a variable ----------
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const LOOKS_LIKE_OTHER = /^(true|false|null|\[\]|\{\})$/;

export function encodeLeaf(v: unknown): string {
  if (typeof v === 'string') return NUMBER.test(v) || LOOKS_LIKE_OTHER.test(v) || v.startsWith('"') || /[\r\n]/.test(v) || v !== v.trim() ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return '[]';
  if (v && typeof v === 'object') return '{}';
  return String(v);
}
export function decodeLeaf(t: string): unknown {
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (t === '[]') return [];
  if (t === '{}') return {};
  if (NUMBER.test(t)) return Number(t);
  if (t.startsWith('"')) { try { const s = JSON.parse(t); if (typeof s === 'string') return s; } catch { /* plain text that starts with a quote */ } }
  return t;
}

// ---------- by path ----------
const encSeg = (k: string) => (k === '' ? '_x_' : k.replace(/[^A-Za-z0-9]/g, (c) => `_x${c.charCodeAt(0).toString(16)}_`));
const decSeg = (k: string) => k.replace(/_x([0-9a-f]*)_/g, (_m, h: string) => (h ? String.fromCharCode(parseInt(h, 16)) : ''));

export function flatten(path: string[], v: unknown, out: [string[], string][] = []): [string[], string][] {
  if (Array.isArray(v) && v.length) v.forEach((x, i) => flatten([...path, String(i)], x, out));
  else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) for (const [k, x] of Object.entries(v)) flatten([...path, k], x, out);
  else out.push([path, encodeLeaf(v)]);
  return out;
}

export function unflatten(entries: [string[], string][]): unknown {
  const root: Record<string, unknown> = {};
  for (const [path, text] of entries) {
    let o = root;
    for (const k of path.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k] as Record<string, unknown>; }
    o[path[path.length - 1]] = decodeLeaf(text);
  }
  const fix = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const keys = Object.keys(v);
    const done = Object.fromEntries(keys.map((k) => [k, fix((v as Record<string, unknown>)[k])]));
    const nums = keys.every((k) => /^\d+$/.test(k)) ? keys.map(Number).sort((a, b) => a - b) : null;
    return keys.length && nums && nums.every((n, i) => n === i) ? nums.map((n) => done[String(n)]) : done;
  };
  return fix(root);
}

// ---------- readable names for lists ----------
type Scope = 'system' | 'owner';
type ListSpec = { scope: Scope; key: string; inside?: string; prefix: string; secret: { name: string; setting: (id: string) => string }; skip?: string[] };
const LISTS: ListSpec[] = [
  // The AIs the administrator set up for everyone (they live in the server's database, with their keys).
  { scope: 'system', key: 'aiSources', prefix: 'SHARED_AI', secret: { name: 'KEY', setting: (id) => `secret:ai:${id}:key` } },
  { scope: 'system', key: 'auth', inside: 'providers', prefix: 'AUTH', secret: { name: 'KEY', setting: (id) => `secret:oauth:${id}` } },
];
const AUTH_SCALARS: [string, string][] = [['enabled', 'AUTH_ENABLED'], ['allow', 'AUTH_ALLOW'], ['publicUrl', 'AUTH_PUBLIC_URL']];
const CLOUD_SERVICES = ['google', 'dropbox', 'onedrive'];

const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Splits a scope's settings into the readable variables and what is left for the by-path form. `rest` no longer holds anything the
 * readable variables already carry.
 */
export function friendlyEntries(scope: Scope, snap: Record<string, unknown>): { entries: [string, string][]; rest: Record<string, unknown> } {
  const rest: Record<string, unknown> = structuredClone(snap);
  const entries: [string, string][] = [];
  for (const spec of LISTS.filter((l) => l.scope === scope)) {
    const holder = spec.inside ? asObject(rest[spec.key]) : rest;
    const list = spec.inside ? holder[spec.inside] : rest[spec.key];
    if (!Array.isArray(list)) continue;
    list.forEach((item, i) => {
      const o = asObject(item), n = i + 1;
      for (const [f, v] of Object.entries(o)) if (isScalar(v) && !spec.skip?.includes(f)) entries.push([`${spec.prefix}_${n}_${snake(f)}`, encodeLeaf(v)]);
      const sk = typeof o.id === 'string' ? spec.secret.setting(o.id) : '';
      const sv = sk ? rest[sk] : undefined;
      if (sk && typeof sv === 'string' && sv) { entries.push([`${spec.prefix}_${n}_${spec.secret.name}`, encodeLeaf(sv)]); delete rest[sk]; }
    });
    if (spec.inside) delete holder[spec.inside]; else delete rest[spec.key];
  }
  if (scope === 'system') {
    const auth = asObject(rest.auth);
    for (const [f, name] of AUTH_SCALARS) {
      if (!(f in auth)) continue;
      const v = auth[f];
      entries.push([name, Array.isArray(v) ? v.join(',') : encodeLeaf(v)]);
      delete auth[f];
    }
    if ('auth' in rest && !Object.keys(auth).length) delete rest.auth;
    const clients = asObject(rest.cloudClients);
    for (const p of CLOUD_SERVICES) {
      const id = asObject(clients[p]).clientId;
      if (typeof id === 'string' && id) entries.push([`CLOUD_${p.toUpperCase()}_CLIENT_ID`, encodeLeaf(id)]);
      const sec = rest[`secret:cloud:client:${p}`];
      if (typeof sec === 'string' && sec) { entries.push([`CLOUD_${p.toUpperCase()}_CLIENT_SECRET`, encodeLeaf(sec)]); delete rest[`secret:cloud:client:${p}`]; }
      if (clients[p] && Object.keys(asObject(clients[p])).every((k) => k === 'clientId')) delete clients[p];
    }
    if ('cloudClients' in rest && !Object.keys(clients).length) delete rest.cloudClients;
  }
  if (scope === 'owner') {
    const cloud = asObject(rest.cloud);
    if ('cloud' in rest && !Object.keys(cloud).length) delete rest.cloud;
  }
  return { entries, rest };
}

export const pathEntries = (prefix: string, rest: Record<string, unknown>): [string, string][] =>
  Object.entries(rest).flatMap(([key, value]) => flatten([key], value).map(([path, text]): [string, string] => [prefix + path.map(encSeg).join('__'), text]));

/**
 * Reads the readable variables back. `values` are whole settings (a list, or the secrets); `patches` are the parts of a setting that
 * is partly written this way (the sign-in methods and sign-in list inside auth, the connections inside cloud).
 */
export function readFriendly(scope: Scope, env: Record<string, string | undefined>): { values: Record<string, unknown>; patches: Record<string, Record<string, unknown>> } {
  const values: Record<string, unknown> = {};
  const patches: Record<string, Record<string, unknown>> = {};
  for (const spec of LISTS.filter((l) => l.scope === scope)) {
    const re = new RegExp(`^${spec.prefix}_(\\d+)_([A-Z0-9_]+)$`);
    const byIndex = new Map<number, Record<string, string>>();
    for (const [name, text] of Object.entries(env)) {
      const m = re.exec(name);
      if (m && text !== undefined) byIndex.set(Number(m[1]), { ...(byIndex.get(Number(m[1])) ?? {}), [m[2]]: text.trim() });
    }
    if (!byIndex.size) continue;
    const list: Record<string, unknown>[] = [];
    for (const n of [...byIndex.keys()].sort((a, b) => a - b)) {
      const fields = byIndex.get(n)!, item: Record<string, unknown> = {};
      for (const [f, text] of Object.entries(fields)) if (f !== spec.secret.name) item[camel(f)] = decodeLeaf(text);
      if (spec.secret.name in fields && typeof item.id === 'string') values[spec.secret.setting(item.id)] = String(decodeLeaf(fields[spec.secret.name]));
      list.push(item);
    }
    if (spec.inside) (patches[spec.key] ??= {})[spec.inside] = list; else values[spec.key] = list;
  }
  if (scope === 'system') {
    for (const [f, name] of AUTH_SCALARS) {
      const t = env[name]?.trim();
      if (t === undefined || t === '') continue;
      (patches.auth ??= {})[f] = f === 'allow' ? t.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) : decodeLeaf(t);
    }
    for (const p of CLOUD_SERVICES) {
      const id = env[`CLOUD_${p.toUpperCase()}_CLIENT_ID`]?.trim(), sec = env[`CLOUD_${p.toUpperCase()}_CLIENT_SECRET`]?.trim();
      if (id) (patches.cloudClients ??= {})[p] = { clientId: String(decodeLeaf(id)) };
      if (sec) values[`secret:cloud:client:${p}`] = String(decodeLeaf(sec));
    }
  }
  return { values, patches };
}

/** The by-path variables of one scope: setting name to value, and anything that could not be read. */
export function readPathVars(prefix: string, env: Record<string, string | undefined>, isKey: (k: string) => boolean): { values: Record<string, unknown>; problems: string[] } {
  const groups = new Map<string, [string[], string][]>();
  const problems: string[] = [];
  for (const [name, text] of Object.entries(env)) {
    if (!name.startsWith(prefix) || text === undefined) continue;
    const segs = name.slice(prefix.length).split('__').map(decSeg);
    if (!segs.length || !isKey(segs[0])) { problems.push(`${name} is not a setting Frames knows, so it was ignored.`); continue; }
    (groups.get(segs[0]) ?? groups.set(segs[0], []).get(segs[0])!).push([segs.slice(1), text.trim()]);
  }
  const values: Record<string, unknown> = {};
  for (const [key, entries] of groups) values[key] = entries.length === 1 && entries[0][0].length === 0 ? decodeLeaf(entries[0][1]) : unflatten(entries);
  return { values, problems };
}
