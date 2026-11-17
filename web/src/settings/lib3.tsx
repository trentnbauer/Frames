import { useStore } from '../store';
import { groupOf, pick, section, without } from './compose';
import { useAi, useCloud, useData, usePortfolio } from './lib2';
import { useAppSettings, useNotifications, useProfile, useReviews, useSecurity, useTags, useXmp } from './lib1';
import type { Ctx } from './sections';
import type { Section } from './ui';

/* ------------------------------------------------------------------ Account */
export const useAccountProfile = useProfile;
export const useAccountSecurity = useSecurity;
export function useAccountNotifications(ctx: Ctx): Section {
  const n = useNotifications(ctx);
  // "Email me when photos are due" is a review setting now.
  return { ...n, groups: without(n, ['remind']) };
}

/* -------------------------------------------------------------- App settings */
export function useAppSettingsPage(ctx: Ctx): Section {
  const a = useAppSettings(ctx);
  const r = useReviews(ctx);
  return section('app', 'App settings', 'Appearance and everyday preferences for your library.', [
    { title: 'Display', rows: pick(a, ['fullWidth', 'theme']) },
    { title: 'While reviewing', rows: pick(r, ['scale']) },
    { title: 'Home', rows: pick(r, ['commHome']) },
    { title: 'To do list', rows: pick(r, ['todo'], { todo: { label: 'Flag photos missing', hint: 'Each photo counts once, however many details it needs.' } }) },
    { title: 'Troubleshooting', rows: pick(a, ['clearSiteData']) },
  ]);
}

/* ------------------------------------------------------------------ Reviews */
export function useReviewSchedule(ctx: Ctx): Section {
  const r = useReviews(ctx);
  const n = useNotifications(ctx);
  return section('reviews', 'Reviews', 'When photos come back for a rating.', [
    { title: 'Sessions', rows: [...pick(r, ['sessions', 'spacing', 'adapt']), ...pick(n, ['remind'], { remind: { label: 'Email me when photos are due' } })] },
    { title: 'Queue', rows: pick(r, ['daily', 'newBoost']) },
    { title: 'Rankings', rows: pick(r, ['weight'], { weight: { hint: 'How much guest scores weigh in composition rankings.' } }) },
  ]);
}
export function useReviewCommunity(ctx: Ctx): Section {
  const r = useReviews(ctx);
  return section('reviews', 'Reviews', 'Anonymous reviews with other Frames users.', [{ title: 'Your photos', rows: pick(r, ['community', 'commFrom', 'commNotes']) }]);
}
export function useReviewCleanup(ctx: Ctx): Section {
  const r = useReviews(ctx);
  const { settings: s } = useStore();
  const sessions = s?.sessions ?? 4;
  return section('reviews', 'Reviews', 'What happens to photos that keep scoring low.', [
    {
      title: 'Suggest removing', meta: 'You confirm each one',
      rows: pick(r, ['suggestRemove', 'removeBelow', 'suggested'], {
        suggestRemove: { hint: `After all ${sessions} review sessions, using only your own ratings. Guest and community ratings are separate. Nothing is removed without asking.` },
        removeBelow: { label: 'Averaging below' },
        suggested: { label: 'Waiting for you', hint: 'Open the removal review.', meta: `${groupOf(r, 'Clean-up')?.rows.find((x) => x.id === 'suggested')?.meta ?? ''} →` },
      }),
    },
    {
      title: 'Remove automatically', meta: 'No confirmation',
      rows: pick(r, ['autoRemove', 'autoRemoveBelow', 'autoRemoveAfter'], { autoRemoveBelow: { label: 'Averaging below' } }),
    },
    { title: 'Bin votes', meta: 'Your own votes only', rows: pick(r, ['binVotes']) },
    { title: 'Never removed', rows: [{ id: 'protectedInfo', t: 'link', label: 'Protected photos', hint: 'Photos in any composition, or in a shoot with an active share link.', meta: 'Always' }] },
  ]);
}

/* ------------------------------------------------------------ Photo details */
export function usePhotoTags(ctx: Ctx): Section {
  const t = useTags(ctx);
  // The portfolio switch lives on the Portfolio page.
  const groups = without(t, ['sensAiLink', 'sensPf']).map((g) => ({ ...g, rows: g.rows.map((r) => (r.id === 'sensList' ? { ...r, hint: 'Photos you tag Nudity, Violence or Adult on the photo page. Never shown in community review.' } : r)) }));
  return { ...t, groups };
}
export function usePhotoXmp(ctx: Ctx): Section {
  const x = useXmp(ctx);
  // The film defaults live on the Gear page now.
  return { ...x, groups: without(x, ['camGear', 'film', 'filmTag']) };
}
export const usePhotoAi = useAi;

/* ----------------------------------------------------------------- Portfolio */
export function usePortfolioPage(ctx: Ctx): Section {
  const p = usePortfolio(ctx);
  const t = useTags(ctx);
  const flagged = pick(t, ['sensPf'], { sensPf: { hint: 'Photos tagged nudity, violence or adult.' } });
  const groups = without(p, ['pfGear']).map((g) => {
    if (g.title !== 'What’s shown') return g;
    const at = g.rows.findIndex((r) => r.id === 'pfOut');
    const rows = [...g.rows];
    rows.splice(at >= 0 ? at + 1 : rows.length, 0, ...flagged);
    return { ...g, rows };
  });
  return { ...p, groups };
}

/* ------------------------------------------------------------ Storage & data */
const PREVIEW_ROWS = ['stLib', 'stCache', 'pvSize', 'pvQuality', 'pvConvert'];
export function useStorageTab(ctx: Ctx): Section {
  const c = useCloud(ctx);
  const d = useData(ctx);
  return { ...c, name: 'Storage & data', hint: 'Where photos come in from, and how much space they take.', groups: [...c.groups, { title: 'Previews', rows: pick(d, PREVIEW_ROWS) }] };
}
export function useDataTab(ctx: Ctx): Section {
  const d = useData(ctx);
  // "Write all XMP sidecars now" is the one XMP row on Photo details, Camera & XMP.
  return { ...d, groups: without(d, [...PREVIEW_ROWS, 'exportXmp']) };
}
