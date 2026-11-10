import type { DB } from './db.js';
import { getSetting } from './db.js';

/** Server-wide choices an administrator makes under Settings, Server. Each has a safe default, so nothing is needed to run. */
export type Policy = {
  sessionDays: number;
  shareExpireDays: number; // 0 = never
  shareDownload: boolean;
  shareAskName: boolean;
  backupAuto: boolean;
  backupEveryDays: 1 | 7;
  backupKeep: number;
};
type Stored = Partial<Record<keyof Policy, unknown>>;

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);

export function policyOf(sys: DB): Policy {
  const i = getSetting<Stored>(sys, 'instance', {});
  return {
    sessionDays: int(i.sessionDays, 1, 365, 14),
    shareExpireDays: [0, 7, 21, 30, 90].includes(i.shareExpireDays as number) ? (i.shareExpireDays as number) : 21,
    shareDownload: i.shareDownload === true,
    shareAskName: i.shareAskName !== false,
    backupAuto: i.backupAuto !== false,
    backupEveryDays: i.backupEveryDays === 7 ? 7 : 1,
    backupKeep: int(i.backupKeep, 1, 60, 7),
  };
}

/** The values a PUT may change, checked. Returns only what is valid; the caller merges it into the stored choices. */
export function policyPatch(b: Record<string, unknown>): Stored {
  const o: Stored = {};
  if (typeof b.sessionDays === 'number' && Number.isInteger(b.sessionDays) && b.sessionDays >= 1 && b.sessionDays <= 365) o.sessionDays = b.sessionDays;
  if ([0, 7, 21, 30, 90].includes(b.shareExpireDays as number)) o.shareExpireDays = b.shareExpireDays;
  if (typeof b.shareDownload === 'boolean') o.shareDownload = b.shareDownload;
  if (typeof b.shareAskName === 'boolean') o.shareAskName = b.shareAskName;
  if (typeof b.backupAuto === 'boolean') o.backupAuto = b.backupAuto;
  if (b.backupEveryDays === 1 || b.backupEveryDays === 7) o.backupEveryDays = b.backupEveryDays;
  if (typeof b.backupKeep === 'number' && Number.isInteger(b.backupKeep) && b.backupKeep >= 1 && b.backupKeep <= 60) o.backupKeep = b.backupKeep;
  return o;
}

/** True when a file newer than `days` days exists, so a weekly schedule skips the days in between. */
export function madeWithin(files: { mtimeMs: number }[], days: number, now = Date.now()): boolean {
  return files.some((f) => now - f.mtimeMs < (days - 0.5) * 86_400_000);
}
