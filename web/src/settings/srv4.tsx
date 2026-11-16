import { groupOf, pick, section, without } from './compose';
import { useBackup, useEmail, useFolders, useMembers, useNetwork, usePolicies, useProcessing, useServer, useSignin, useSrvAi } from './srv';
import type { Ctx } from './sections';
import type { Section } from './ui';

/** The Server pages, put together from the rows the older pages made, so a row can move between tabs without being rewritten. */

/* ------------------------------------------------------------------- Access */
export function useAccessSignin(ctx: Ctx): Section {
  const s = useSignin(ctx);
  const methods = groupOf(s, 'Sign-in methods · test before turning on');
  return section('signin', 'Access', 'How people get in. Test a method before turning it on.', [
    { title: 'Sign-in methods', meta: 'Test before turning on', rows: methods?.rows ?? [] },
    { title: 'Passwords', rows: pick(s, ['passwordSignin']) },
  ], { notice: s.notice, after: s.after });
}
export function useAccessSecurity(ctx: Ctx): Section {
  const s = useSignin(ctx);
  const bot = groupOf(s, 'Bot check · Cloudflare Turnstile');
  return section('signin', 'Access', 'Who must sign in, and how strongly.', [
    { rows: pick(s, ['requireSignin', 'allowList', 'mfaPolicy', 'session']) },
    ...(bot ? [bot] : []),
  ], { notice: s.notice });
}
export function useAccessMembers(ctx: Ctx): Section {
  const m = useMembers(ctx);
  const s = useSignin(ctx);
  const members = groupOf(m, 'Members');
  return section('people', 'Access', 'Who can sign in to this Frames.', [
    ...(members ? [members] : []),
    { title: 'Joining', rows: pick(s, ['signup', 'newRole']) },
    { title: 'Defaults', rows: [...pick(m, ['shareLib']), ...pick(m, ['manage'])] },
  ], { action: m.action, after: m.after });
}

/* ------------------------------------------------------------------ Sharing */
export function useSharingGuests(ctx: Ctx): Section {
  const s = useSignin(ctx);
  return section('sharing', 'Sharing', 'Defaults for every share link on this server.', [{ rows: pick(s, ['guestExpiry', 'guestDl', 'guestName']) }]);
}
export function useSharingPortfolios(ctx: Ctx): Section {
  const f = useFolders(ctx);
  return section('sharing', 'Sharing', 'What public portfolios may offer.', [{ rows: pick(f, ['allowOrig']) }]);
}
export const useSharingPolicies = usePolicies;

/* ------------------------------------------------------------------ Storage */
export function useStorageLimits(ctx: Ctx): Section {
  const f = useFolders(ctx);
  return section('folders', 'Storage', 'Limits across local and cloud storage.', [{ title: 'Member storage', rows: pick(f, ['userQuota']) }]);
}
export function useStorageLocal(ctx: Ctx): Section {
  const f = useFolders(ctx);
  const g = groupOf(f, 'Local storage');
  return section('folders', 'Storage', 'Photos uploaded to, or read from, this server.', g ? [g] : [], { notice: f.notice });
}
export function useStorageCloud(ctx: Ctx): Section {
  const f = useFolders(ctx);
  const groups = ['Cloud storage', 'Cloud providers'].map((t) => groupOf(f, t)).filter((g): g is NonNullable<typeof g> => !!g);
  return section('folders', 'Storage', 'Members bring photos in from their own cloud accounts. Frames only reads.', groups, { notice: f.notice });
}
export function useStoragePreviews(ctx: Ctx): Section {
  const f = useFolders(ctx);
  const p = useProcessing(ctx);
  const previews = groupOf(f, 'Previews · both');
  const cache = groupOf(p, 'Cache');
  return section('folders', 'Storage', 'Thumbnails and previews for everyone.', [
    { title: 'Previews', rows: previews?.rows ?? [] },
    ...(cache ? [cache] : []),
    { title: 'Files', rows: pick(f, ['sidecar']) },
  ], { notice: f.notice });
}

/* ---------------------------------------------------------- Network & email */
export const useNetworkTunnel = useNetwork;
export const useNetworkEmail = useEmail;

/* ------------------------------------------------------------------- System */
export function useSystemUpdates(ctx: Ctx): Section {
  const v = useServer(ctx);
  const updates = groupOf(v, 'Updates');
  const logs = groupOf(v, 'Logs & health');
  return section('server', 'System', 'Version, health and logs.', [
    ...(updates ? [updates] : []),
    { title: 'Logs & health', rows: [...(logs?.rows ?? []), ...pick(v, ['restart'])] },
  ]);
}
export function useSystemProcessing(ctx: Ctx): Section {
  const p = useProcessing(ctx);
  // The cache settings are on Storage, Previews & cache.
  return section('processing', 'System', 'Background work on this server.', without(p, ['cachePath', 'cacheUse', 'cacheMax']));
}
export function useSystemEnvironment(ctx: Ctx): Section {
  const v = useServer(ctx);
  return section('server', 'System', 'The frames.env file and these settings.', [{ rows: pick(v, ['env', 'envExport', 'envSecrets', 'envImport']) }]);
}

export { useBackup, useSrvAi };
