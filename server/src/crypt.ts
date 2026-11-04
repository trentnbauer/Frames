import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Secrets at rest: every API key, client secret and token Frames keeps is stored encrypted (AES-256-GCM, a fresh random nonce each time),
 * not as readable text in the database. A copy of a database file on its own then reveals none of them.
 *
 * The key comes from FRAMES_SECRET_KEY (any text, at least 16 characters) when that is set: keep it outside the data volume, for example in the
 * stack's environment, and the data volume alone is not enough to read the secrets. Without it, Frames makes a random key the first time it
 * needs one and keeps it in `secret.key` in the data folder (readable only by Frames' user). That protects a database that is copied or
 * backed up on its own, but not someone who takes the whole data folder; the variable is what closes that gap.
 *
 * Values from before this existed (plain text) are still read, and are encrypted the next time Frames opens the database.
 * If the key is lost or changed, the secrets cannot be read: they come back empty, and you enter them again.
 */
const PREFIX = 'enc:v1:';
const keys = new Map<string, Buffer>();

export const isSealed = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX);

/** The key for a data folder, made on first use. */
export function keyFor(root: string): Buffer {
  const env = (process.env.FRAMES_SECRET_KEY ?? '').trim();
  const id = env ? `env:${env}` : path.resolve(root);
  const hit = keys.get(id);
  if (hit) return hit;
  let key: Buffer;
  if (env) {
    if (env.length < 16) throw new Error('FRAMES_SECRET_KEY must be at least 16 characters.');
    key = crypto.scryptSync(env, 'frames-secrets-v1', 32);
  } else {
    const file = path.join(root, 'secret.key');
    fs.mkdirSync(root, { recursive: true });
    try { key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'); } catch { key = Buffer.alloc(0); }
    if (key.length !== 32) {
      key = crypto.randomBytes(32);
      fs.writeFileSync(file, key.toString('base64') + '\n', { mode: 0o600 });
    }
  }
  keys.set(id, key);
  return key;
}

export function seal(key: Buffer, plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

let warned = false;
/** Plain text passes through (a value from before encryption); a sealed value is decrypted, or comes back empty if the key is wrong. */
export function unseal(key: Buffer, value: string): string {
  if (!isSealed(value)) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    if (!warned) { warned = true; console.error('A saved secret could not be decrypted: the key (FRAMES_SECRET_KEY or secret.key) is not the one it was saved with. Enter it again in Settings.'); }
    return '';
  }
}
