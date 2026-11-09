import crypto from 'node:crypto';

/**
 * A small S3 client, for backups only: put, list, get and delete one object, signed with Signature Version 4. It uses path-style
 * addresses (endpoint/bucket/key), which AWS, MinIO, Backblaze B2 and Wasabi all accept. No library: four requests do not need one.
 */
export type S3Config = { endpoint: string; region: string; bucket: string; prefix: string; accessKeyId: string; secretAccessKey: string };

/** Replaced in tests, which must never reach a real service. */
export const s3Net = { fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init) };

const sha = (d: string | Buffer) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k: string | Buffer, d: string) => crypto.createHmac('sha256', k).update(d).digest();
// S3 wants every character except unreserved ones escaped, and "/" kept in the path.
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The Authorization header (and the headers it signs) for one request. Exported so a test can check it against an independent calculation. */
export function sign(c: S3Config, method: string, host: string, path: string, query: [string, string][], body: Buffer, at = new Date()) {
  const amzDate = at.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260101T000000Z
  const day = amzDate.slice(0, 8);
  const payload = sha(body);
  const headers: Record<string, string> = { host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const canonQuery = [...query].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const canonical = [method, path, canonQuery, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), payload].join('\n');
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, day), c.region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

async function call(c: S3Config, method: 'GET' | 'PUT' | 'DELETE', key: string, query: [string, string][] = [], body: Buffer = Buffer.alloc(0)): Promise<Response> {
  const u = new URL(c.endpoint);
  const path = `/${enc(c.bucket)}${key ? '/' + key.split('/').map(enc).join('/') : ''}`;
  const headers = sign(c, method, u.host, path, query, body);
  const qs = query.length ? '?' + query.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&') : '';
  const { host: _h, ...send } = headers as Record<string, string>; // the host header is set by the request itself
  const r = await s3Net.fetch(`${u.protocol}//${u.host}${path}${qs}`, { method, headers: send, ...(method === 'PUT' ? { body: new Uint8Array(body) } : {}), signal: AbortSignal.timeout(10 * 60_000), redirect: 'error' });
  if (!r.ok) {
    const text = (await r.text().catch(() => '')).replace(/\s+/g, ' ');
    const code = /<Code>([^<]{1,60})<\/Code>/.exec(text)?.[1];
    throw new Error(`The storage service said ${r.status}${code ? ` (${code})` : ''}.`);
  }
  return r;
}

const keyOf = (c: S3Config, name: string) => `${c.prefix.replace(/^\/+|\/+$/g, '')}${c.prefix.replace(/^\/+|\/+$/g, '') ? '/' : ''}${name}`;

export const s3Put = (c: S3Config, name: string, data: Buffer) => call(c, 'PUT', keyOf(c, name), [], data).then(() => undefined);
export const s3Delete = (c: S3Config, name: string) => call(c, 'DELETE', keyOf(c, name)).then(() => undefined);
export const s3Get = async (c: S3Config, name: string) => Buffer.from(await (await call(c, 'GET', keyOf(c, name))).arrayBuffer());

/** The objects under the prefix (one level), newest name first. */
export async function s3List(c: S3Config): Promise<{ name: string; bytes: number; at: string }[]> {
  const p = keyOf(c, '');
  const xml = await (await call(c, 'GET', '', [['list-type', '2'], ['prefix', p], ['max-keys', '1000']])).text();
  const out: { name: string; bytes: number; at: string }[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const get = (t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[1])?.[1] ?? '';
    const key = get('Key').replace(/&amp;/g, '&');
    const name = key.slice(p.length);
    if (name && !name.includes('/')) out.push({ name, bytes: Number(get('Size')) || 0, at: get('LastModified') });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

/** What the person typed, checked: an https address (http only for a service on this machine or network), and plain names. Throws a plain message. */
export function cleanConfig(raw: Record<string, unknown>, secret: string): S3Config {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const endpoint = text(raw.endpoint, 300).replace(/\/+$/, '');
  let u: URL;
  try { u = new URL(endpoint); } catch { throw new Error('The endpoint must be an address such as https://s3.us-east-1.amazonaws.com'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The endpoint must start with https://');
  if (u.protocol === 'http:' && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^.]+$)/.test(u.hostname)) throw new Error('Use https:// for a service on the internet. Plain http is only for one on your own network.');
  const bucket = text(raw.bucket, 63);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$/.test(bucket)) throw new Error('The bucket name is not valid.');
  const region = text(raw.region, 40) || 'us-east-1';
  if (!/^[A-Za-z0-9-]{2,40}$/.test(region)) throw new Error('The region is not valid.');
  const accessKeyId = text(raw.accessKeyId, 128);
  if (!accessKeyId) throw new Error('Enter the access key.');
  if (!secret) throw new Error('Enter the secret key.');
  const prefix = text(raw.prefix, 200).replace(/^\/+|\/+$/g, '');
  if (/[\\\0]|\.\.\//.test(prefix)) throw new Error('The folder in the bucket is not valid.');
  return { endpoint: `${u.protocol}//${u.host}`, region, bucket, prefix, accessKeyId, secretAccessKey: secret };
}
