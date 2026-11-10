import sharp from 'sharp';
import type { DB } from './db.js';
import { getSetting } from './db.js';

/** Server-wide choices an administrator makes under Settings, Server. Each has a safe default, so nothing is needed to run. */
export type Policy = {
  sessionDays: number;
  shareExpireDays: number; // 0 = never
  shareDownload: boolean;
  shareAskName: boolean;
  backupAuto: boolean;
  backupEveryDays: 1 | 7 | 30;
  backupKeep: number;
  cacheLimitGb: number; // 0 = no limit
  previewPx: number;
  workers: number;
  logLevel: 'errors' | 'warnings' | 'info' | 'debug';
  updateChannel: 'stable' | 'beta';
  cloudWho: 'admins' | 'members';
  cloudMinSyncMin: number;
  cloudQuotaGb: number; // 0 = none
  membersSeeShoots: boolean;
  aiMonthlyLimit: number; // requests to a shared AI per person per month, 0 = none
  aiMembersOwn: boolean;
  aiSharedFirst: boolean; // a person who has not set their own order starts with the shared AIs first
  heavyJobs: 'always' | 'overnight' | 'idle';
  rawPreview: 'embedded' | 'full';
  showWhatsNew: boolean;
  crashReports: boolean;
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
    backupEveryDays: i.backupEveryDays === 7 ? 7 : i.backupEveryDays === 30 ? 30 : 1,
    backupKeep: int(i.backupKeep, 1, 90, 7),
    cacheLimitGb: [0, 10, 25, 50, 100, 250].includes(i.cacheLimitGb as number) ? (i.cacheLimitGb as number) : 0,
    previewPx: [1600, 2400, 3072, 4096].includes(i.previewPx as number) ? (i.previewPx as number) : 2400,
    workers: int(i.workers, 0, 8, 0), // 0 = as many as there are processors
    logLevel: i.logLevel === 'errors' || i.logLevel === 'warnings' || i.logLevel === 'debug' ? i.logLevel : 'info',
    updateChannel: i.updateChannel === 'beta' ? 'beta' : 'stable',
    cloudWho: i.cloudWho === 'admins' ? 'admins' : 'members',
    cloudMinSyncMin: [15, 30, 60, 360, 1440].includes(i.cloudMinSyncMin as number) ? (i.cloudMinSyncMin as number) : 15,
    cloudQuotaGb: [0, 50, 100, 200, 500].includes(i.cloudQuotaGb as number) ? (i.cloudQuotaGb as number) : 0,
    membersSeeShoots: i.membersSeeShoots === true,
    aiMonthlyLimit: [0, 100, 500, 2000, 10000].includes(i.aiMonthlyLimit as number) ? (i.aiMonthlyLimit as number) : 0,
    aiMembersOwn: i.aiMembersOwn !== false,
    aiSharedFirst: i.aiSharedFirst === true,
    heavyJobs: i.heavyJobs === 'idle' || i.heavyJobs === 'overnight' ? i.heavyJobs : 'always',
    rawPreview: i.rawPreview === 'full' ? 'full' : 'embedded',
    showWhatsNew: i.showWhatsNew !== false,
    crashReports: i.crashReports === true,
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
  if (b.backupEveryDays === 1 || b.backupEveryDays === 7 || b.backupEveryDays === 30) o.backupEveryDays = b.backupEveryDays;
  if (typeof b.backupKeep === 'number' && Number.isInteger(b.backupKeep) && b.backupKeep >= 1 && b.backupKeep <= 90) o.backupKeep = b.backupKeep;
  const pick = (k: string, allowed: unknown[]) => { if (allowed.includes(b[k])) o[k as keyof Policy] = b[k]; };
  pick('cacheLimitGb', [0, 10, 25, 50, 100, 250]); pick('previewPx', [1600, 2400, 3072, 4096]);
  if (typeof b.workers === 'number' && Number.isInteger(b.workers) && b.workers >= 0 && b.workers <= 8) o.workers = b.workers;
  pick('logLevel', ['errors', 'warnings', 'info', 'debug']); pick('rawPreview', ['embedded', 'full']);
  if (typeof b.showWhatsNew === 'boolean') o.showWhatsNew = b.showWhatsNew; pick('updateChannel', ['stable', 'beta']); pick('cloudWho', ['admins', 'members']);
  pick('cloudMinSyncMin', [15, 30, 60, 360, 1440]); pick('cloudQuotaGb', [0, 50, 100, 200, 500]); pick('aiMonthlyLimit', [0, 100, 500, 2000, 10000]);
  if (typeof b.membersSeeShoots === 'boolean') o.membersSeeShoots = b.membersSeeShoots;
  if (typeof b.aiMembersOwn === 'boolean') o.aiMembersOwn = b.aiMembersOwn;
  if (typeof b.aiSharedFirst === 'boolean') o.aiSharedFirst = b.aiSharedFirst;
  if (typeof b.crashReports === 'boolean') o.crashReports = b.crashReports;
  pick('heavyJobs', ['always', 'overnight', 'idle']);
  return o;
}

/** Values read on every use by code that has no database in hand (image making). Set at start-up and whenever the choices change. */
export const runtime = { previewPx: 2400, workers: 0, rawPreview: 'embedded' as 'embedded' | 'full' };
export function applyRuntime(sys: DB) { const p = policyOf(sys); runtime.previewPx = p.previewPx; runtime.workers = p.workers; runtime.rawPreview = p.rawPreview; sharp.concurrency(p.workers); }

/** True when a file newer than `days` days exists, so a weekly schedule skips the days in between. */
export function madeWithin(files: { mtimeMs: number }[], days: number, now = Date.now()): boolean {
  return files.some((f) => now - f.mtimeMs < (days - 0.5) * 86_400_000);
}
