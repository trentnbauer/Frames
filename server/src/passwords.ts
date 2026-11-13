import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getSecret, setSecret } from './ai.js';
import type { DB } from './db.js';

const scrypt = promisify(crypto.scrypt);
const key = (userId: number) => `password:${userId}`;
export const hasPassword = (sys: DB, userId: number) => !!getSecret(sys, key(userId));
export const passwordError = (value: unknown) => typeof value !== 'string' || value.length < 12 || value.length > 256 ? 'Use a password between 12 and 256 characters.' : null;
/** Slow salted hashes, encrypted at rest and omitted from exports with other secret settings. */
export async function passwordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
/** Unknown accounts still pay for a full hash, and comparisons are constant-time. */
export async function checkPassword(sys: DB, userId: number | null, password: unknown): Promise<boolean> {
  const stored = userId === null ? '' : getSecret(sys, key(userId));
  const valid = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
  const [salt, expected] = (valid ? stored : dummy).split(':');
  const supplied = typeof password === 'string' && password.length <= 256 ? password : '';
  const actual = await scrypt(supplied, salt, 64) as Buffer;
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex')) && valid && !passwordError(password) && userId !== null && getSecret(sys, key(userId)) === stored;
}
export const savePasswordHash = (sys: DB, userId: number, hash: string) => setSecret(sys, key(userId), hash);
