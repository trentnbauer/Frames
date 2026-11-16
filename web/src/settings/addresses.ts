import proto from './proto.json';

export type Tab = 'lib' | 'srv';
export type Place = { tab: Tab; key: string; sub?: string };
export type Idx = { tab: Tab; sec: string; sub?: string; id: string; g: string; label: string; hint: string };

/** The addresses older Settings pages used (the very old page names), so a link or a bookmark still lands in the right place. */
const OLD: Record<string, [Tab, string]> = {
  'app-settings': ['lib', 'app'], app: ['lib', 'app'], profile: ['lib', 'profile'], notifications: ['lib', 'notifications'], reviews: ['lib', 'reviews'], 'tags-subjects': ['lib', 'tags'], 'metadata-xmp': ['lib', 'xmp'], ai: ['lib', 'ai'], 'cloud-sync': ['lib', 'cloud'], portfolio: ['lib', 'portfolio'], 'your-data': ['lib', 'data'], 'sign-in-methods': ['lib', 'security'], 'password-security': ['lib', 'security'],
  access: ['srv', 'signin'], 'sign-in-access': ['srv', 'signin'], people: ['srv', 'people'], members: ['srv', 'people'], 'libraries-storage': ['srv', 'folders'], 'photos-storage': ['srv', 'folders'], 'cloud-services': ['srv', 'folders'], backup: ['srv', 'backup'], 'shared-ai': ['srv', 'srvai'],
  'cloudflare-tunnel': ['srv', 'network'], email: ['srv', 'email'], 'env-file': ['srv', 'server'], 'storage-processing': ['srv', 'processing'], 'updates-system': ['srv', 'server'], about: ['srv', 'server'],
};

/** Your-library sections that were merged: where each old section key lives now (the section, and the tab inside it). */
export const LIB_MOVED: Record<string, [string, string?]> = {
  profile: ['account', 'profile'], security: ['account', 'security'], notifications: ['account', 'notifications'],
  reviews: ['reviews', 'schedule'], tags: ['photo', 'tags'], xmp: ['photo', 'camera-xmp'], ai: ['photo', 'ai'],
  cloud: ['storage', 'storage'], data: ['storage', 'your-data'], app: ['app'], portfolio: ['portfolio'],
};

/** Which tab and section an address asks for: the current ones, the previous section names, the older page names, or the old ?access= and ?cloud= returns. */
export function parseAddress(params: URLSearchParams): Place {
  const s = params.get('section') ?? '';
  const t = params.get('tab');
  const sub = params.get('sub') ?? undefined;
  let place: Place;
  if (t === 'srv' || t === 'lib') place = { tab: t, key: s, sub };
  else if (OLD[s]) place = { tab: OLD[s][0], key: OLD[s][1], sub };
  else if (params.has('access')) place = { tab: 'srv', key: 'signin', sub };
  else if (params.has('cloud')) place = { tab: 'lib', key: 'cloud', sub };
  else place = { tab: 'lib', key: s, sub };
  if (place.tab === 'lib' && LIB_MOVED[place.key]) {
    const [key, home] = LIB_MOVED[place.key];
    // An address that already names a tab inside the section keeps it; an old section name opens the tab its settings moved to.
    place = { tab: 'lib', key, sub: place.key === key ? place.sub ?? home : home };
  }
  return place;
}

/** Rows that moved to another section or tab, as [section, tab]. Everything else stays where its old section went (LIB_MOVED). */
const ROW_HOME: Record<string, [string, string?]> = {
  remind: ['reviews', 'schedule'],
  scale: ['app'], blind: ['app'], commHome: ['app'], todo: ['app'],
  community: ['reviews', 'community'], commFrom: ['reviews', 'community'], commNotes: ['reviews', 'community'],
  suggestRemove: ['reviews', 'clean-up'], removeBelow: ['reviews', 'clean-up'], suggested: ['reviews', 'clean-up'], autoRemove: ['reviews', 'clean-up'], autoRemoveBelow: ['reviews', 'clean-up'], autoRemoveAfter: ['reviews', 'clean-up'],
  sensPf: ['portfolio'],
  stLib: ['storage', 'storage'], stCache: ['storage', 'storage'],
};
/** Rows that were renamed. */
const ROW_LABEL: Record<string, Partial<Pick<Idx, 'label' | 'hint'>>> = {
  remind: { label: 'Email me when photos are due' }, suggested: { label: 'Waiting for you', hint: 'Open the removal review.' },
  removeBelow: { label: 'Averaging below' }, autoRemoveBelow: { label: 'Averaging below' }, todo: { label: 'Flag photos missing' },
};
/** Rows that no longer exist (link-only duplicates, or moved into a menu). */
const ROW_GONE = new Set(['welcomeTour', 'sensAiLink', 'removeVotes', 'exportXmp', 'pfGear', 'camGear']);
/** Rows the search index did not list before. */
const ROW_NEW: Idx[] = [
  { tab: 'lib', sec: 'reviews', sub: 'clean-up', id: 'protectedInfo', g: 'Never removed', label: 'Protected photos', hint: 'Photos in any composition, or in a shoot with an active share link.' },
  { tab: 'lib', sec: 'storage', sub: 'storage', id: 'pvSize', g: 'Previews', label: 'Preview size', hint: 'What you see on the Photo page and in Review.' },
  { tab: 'lib', sec: 'storage', sub: 'storage', id: 'pvQuality', g: 'Previews', label: 'Preview quality', hint: 'JPEG quality, 70 to 95.' },
  { tab: 'lib', sec: 'storage', sub: 'storage', id: 'pvConvert', g: 'Previews', label: 'Convert existing previews', hint: 'Every preview matches your settings.' },
];

/** What the settings search looks through: every row, with the section and tab it lives in now. */
export const ROWS: Idx[] = [
  ...(proto.rows as Idx[]).filter((r) => !ROW_GONE.has(r.id)).map((r): Idx => {
    if (r.tab !== 'lib') return r;
    const [sec, sub] = ROW_HOME[r.id] ?? LIB_MOVED[r.sec] ?? [r.sec];
    return { ...r, sec, sub: ROW_HOME[r.id] ? sub : LIB_MOVED[r.sec]?.[1], ...(ROW_LABEL[r.id] ?? {}) };
  }),
  ...ROW_NEW,
];
export const NAMES = new Map<string, string>([
  ...(proto.sections as { tab: Tab; key: string; name: string }[]).map((s): [string, string] => [`${s.tab}:${s.key}`, s.name]),
  ['lib:account', 'Account'], ['lib:photo', 'Photo details'], ['lib:storage', 'Storage & data'],
]);
