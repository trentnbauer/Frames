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
  previewPx: number; // the largest preview any photograph gets (people can choose smaller)
  previewQuality: number; // the highest JPEG quality for previews (people can choose lower)
  /** Local storage: uploads and the library folders. Off: nobody can upload and library folders are not read (photos already here stay). */
  localOn: boolean;
  /** Cloud storage: members bring photos in from their own cloud accounts. Off: nobody can connect or sync (photos already copied stay). */
  cloudOn: boolean;
  /** Store original quality, for uploads (local) and for cloud copies. Off: a smaller copy is kept, at the size and JPEG quality below. */
  localOrig: boolean; cloudOrig: boolean;
  localPx: number; cloudPx: number; // longest side of a smaller copy
  localQ: number; cloudQ: number; // its JPEG quality
  maxUploadMb: number; // the largest single photograph a person can upload
  cloudMaxFileMb: number; // the largest single file a cloud sync will copy in
  workers: number;
  logLevel: 'errors' | 'warnings' | 'info' | 'debug';
  updateChannel: 'stable' | 'beta';
  cloudWho: 'admins' | 'members';
  cloudMinSyncMin: number;
  cloudQuotaGb: number; // 0 = none
  userQuotaGb: number; // storage per member in GB (decimals allowed: 0.5 is 512 MB), 0 = no limit (administrators are never limited)
  membersSeeShoots: boolean;
  aiMonthlyLimit: number; // requests to a shared AI per person per month, 0 = none
  aiMembersOwn: boolean;
  aiSharedFirst: boolean; // a person who has not set their own order starts with the shared AIs first
  heavyJobs: 'always' | 'overnight' | 'idle';
  rawPreview: 'embedded' | 'full';
  showWhatsNew: boolean;
};
type Stored = Partial<Record<keyof Policy, unknown>> & { cloudOnly?: unknown; storeOriginalQuality?: unknown }; // the last two are the older switches

/** The most a size limit can be set to (100 GB). */
export const MAX_FILE_MB = 102_400;
/** The sizes (longest side, px) a smaller copy of a photograph can be held to. */
export const COPY_SIZES = [2048, 3072, 4096, 6144];
export const PREVIEW_SIZES = [1600, 2400, 3072, 4096];
export const PREVIEW_QUALITIES = [70, 75, 80, 85, 88, 90, 95];
/** A storage limit in GB typed by an administrator: 0 (none) up to a petabyte, in steps of a thousandth of a GB. Null when it is not a number like that. */
export const quotaGb = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000 ? Math.round(v * 1000) / 1000 : null);
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
    previewQuality: PREVIEW_QUALITIES.includes(i.previewQuality as number) ? (i.previewQuality as number) : 90,
    // The older single switches still read: cloudOnly was "no local storage", storeOriginalQuality was both of the two below.
    localOn: typeof i.localOn === 'boolean' ? i.localOn : i.cloudOnly !== true,
    cloudOn: i.cloudOn !== false,
    localOrig: typeof i.localOrig === 'boolean' ? i.localOrig : i.storeOriginalQuality === true,
    cloudOrig: typeof i.cloudOrig === 'boolean' ? i.cloudOrig : i.storeOriginalQuality === true,
    localPx: COPY_SIZES.includes(i.localPx as number) ? (i.localPx as number) : 6144, cloudPx: COPY_SIZES.includes(i.cloudPx as number) ? (i.cloudPx as number) : 4096,
    localQ: PREVIEW_QUALITIES.includes(i.localQ as number) ? (i.localQ as number) : 80, cloudQ: PREVIEW_QUALITIES.includes(i.cloudQ as number) ? (i.cloudQ as number) : 80,
    maxUploadMb: int(i.maxUploadMb, 1, MAX_FILE_MB, Number(process.env.MAX_UPLOAD_MB) > 0 ? Math.min(MAX_FILE_MB, Math.floor(Number(process.env.MAX_UPLOAD_MB))) : 2048), // set in the app, else MAX_UPLOAD_MB, else 2048
    cloudMaxFileMb: int(i.cloudMaxFileMb, 1, MAX_FILE_MB, Number(process.env.CLOUD_MAX_FILE_MB) > 0 ? Math.min(MAX_FILE_MB, Math.floor(Number(process.env.CLOUD_MAX_FILE_MB))) : 1024),
    workers: int(i.workers, 0, 8, 0), // 0 = as many as there are processors
    logLevel: i.logLevel === 'errors' || i.logLevel === 'warnings' || i.logLevel === 'debug' ? i.logLevel : 'info',
    updateChannel: i.updateChannel === 'beta' ? 'beta' : 'stable',
    cloudWho: i.cloudWho === 'admins' ? 'admins' : 'members',
    cloudMinSyncMin: [15, 30, 60, 360, 1440].includes(i.cloudMinSyncMin as number) ? (i.cloudMinSyncMin as number) : 15,
    cloudQuotaGb: [0, 50, 100, 200, 500].includes(i.cloudQuotaGb as number) ? (i.cloudQuotaGb as number) : 0,
    userQuotaGb: quotaGb(i.userQuotaGb) ?? 0,
    membersSeeShoots: i.membersSeeShoots === true,
    aiMonthlyLimit: [0, 100, 500, 2000, 10000].includes(i.aiMonthlyLimit as number) ? (i.aiMonthlyLimit as number) : 0,
    aiMembersOwn: i.aiMembersOwn !== false,
    aiSharedFirst: i.aiSharedFirst === true,
    heavyJobs: i.heavyJobs === 'idle' || i.heavyJobs === 'overnight' ? i.heavyJobs : 'always',
    rawPreview: i.rawPreview === 'full' ? 'full' : 'embedded',
    showWhatsNew: i.showWhatsNew !== false,
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
  pick('cacheLimitGb', [0, 10, 25, 50, 100, 250]); pick('previewPx', [1600, 2400, 3072, 4096]); pick('previewQuality', PREVIEW_QUALITIES);
  for (const k of ['localOn', 'cloudOn', 'localOrig', 'cloudOrig'] as const) if (typeof b[k] === 'boolean') o[k] = b[k];
  pick('localPx', COPY_SIZES); pick('cloudPx', COPY_SIZES); pick('localQ', PREVIEW_QUALITIES); pick('cloudQ', PREVIEW_QUALITIES);
  for (const k of ['maxUploadMb', 'cloudMaxFileMb'] as const) if (typeof b[k] === 'number' && Number.isInteger(b[k]) && (b[k] as number) >= 1 && (b[k] as number) <= MAX_FILE_MB) o[k] = b[k];
  if (typeof b.workers === 'number' && Number.isInteger(b.workers) && b.workers >= 0 && b.workers <= 8) o.workers = b.workers;
  pick('logLevel', ['errors', 'warnings', 'info', 'debug']); pick('rawPreview', ['embedded', 'full']);
  if (typeof b.showWhatsNew === 'boolean') o.showWhatsNew = b.showWhatsNew; pick('updateChannel', ['stable', 'beta']); pick('cloudWho', ['admins', 'members']);
  pick('cloudMinSyncMin', [15, 30, 60, 360, 1440]); pick('cloudQuotaGb', [0, 50, 100, 200, 500]); if (quotaGb(b.userQuotaGb) !== null) o.userQuotaGb = quotaGb(b.userQuotaGb)!; pick('aiMonthlyLimit', [0, 100, 500, 2000, 10000]);
  if (typeof b.membersSeeShoots === 'boolean') o.membersSeeShoots = b.membersSeeShoots;
  if (typeof b.aiMembersOwn === 'boolean') o.aiMembersOwn = b.aiMembersOwn;
  if (typeof b.aiSharedFirst === 'boolean') o.aiSharedFirst = b.aiSharedFirst;
  pick('heavyJobs', ['always', 'overnight', 'idle']);
  return o;
}

/** Values read on every use by code that has no database in hand (image making). Set at start-up and whenever the choices change. */
export const runtime = { previewPx: 2400, previewQuality: 90, cloudMaxFileMb: 1024, workers: 0, rawPreview: 'embedded' as 'embedded' | 'full' };
export function applyRuntime(sys: DB) { const p = policyOf(sys); runtime.previewPx = p.previewPx; runtime.previewQuality = p.previewQuality; runtime.cloudMaxFileMb = p.cloudMaxFileMb; runtime.workers = p.workers; runtime.rawPreview = p.rawPreview; sharp.concurrency(p.workers); }

/** True when a file newer than `days` days exists, so a weekly schedule skips the days in between. */
export function madeWithin(files: { mtimeMs: number }[], days: number, now = Date.now()): boolean {
  return files.some((f) => now - f.mtimeMs < (days - 0.5) * 86_400_000);
}
