import { useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from '../components/Modal';
import { useStore } from '../store';
import { useTheme, setTheme } from '../theme';
import { Profile } from '../pages/Profile';
import { SignInMethods } from '../pages/SignInMethods';
import { usePrefs } from './hooks';
import { DeleteSuggestions, Vocabulary, Metadata } from './old';
import type { Ctx } from './sections';
import type { R, Section } from './ui';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'That did not work.');
const COUNTRIES = ['Australia', 'New Zealand', 'South Africa', 'Argentina', 'Brazil', 'Chile', 'Canada', 'France', 'Germany', 'Ireland', 'Japan', 'Netherlands', 'United Kingdom', 'United States'];
const close = (ctx: Ctx) => () => ctx.modal(null);

/* ------------------------------------------------------------------ Profile */
type P = { displayName: string; hasAvatar: boolean; signedInAs: string; country: string };

/** Passkeys on this account: the devices that can sign in as you, add this device, remove one. */
function Passkeys({ ctx, onChange }: { ctx: Ctx; onChange: () => void }) {
  const list = useApi<{ passkeys: { id: string; name: string; created: string; lastUsed: string | null }[] }>('/me/passkeys');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => {
    setBusy(true); setErr('');
    try {
      if (!window.PublicKeyCredential) throw new Error('This browser or address does not support passkeys. Passkeys need https (or localhost).');
      const { options, cid } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; cid: string }>('/me/passkeys/options', { method: 'POST', body: {} });
      const response = await startRegistration({ optionsJSON: options });
      await api('/me/passkeys/verify', { method: 'POST', body: { cid, response, name: navigator.platform || 'This device' } });
      list.reload(); onChange(); ctx.toast('Passkey added');
    } catch (e) { const m = (e as Error).message; setErr(/cancel|abort|NotAllowed/i.test(m) ? 'Cancelled. Nothing was added.' : m); } finally { setBusy(false); }
  };
  return (
    <Modal title="Passkeys" sub="Devices that can sign in as you, with a fingerprint, face or device PIN." width={560} onClose={close(ctx)} foot={<><span className="grow" style={{ fontSize: 12.5, color: '#e79a82' }}>{err}</span><button className="btn" onClick={close(ctx)}>Done</button><button className="btn primary" disabled={busy} onClick={add}>{busy ? 'Waiting for your device…' : 'Add this device'}</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        {(list.data?.passkeys ?? []).length === 0 && <span style={{ fontSize: 13.5, color: '#8f8c86' }}>No passkeys yet.</span>}
        {(list.data?.passkeys ?? []).map((k) => (
          <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 14 }}>
            <span>{k.name}<span style={{ display: 'block', fontSize: 12, color: '#8f8c86' }}>Added {new Date(k.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}{k.lastUsed ? ` · used ${new Date(k.lastUsed).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}</span></span>
            <span style={{ display: 'flex', gap: 16 }}>
              <button style={{ color: '#a8a59f', fontSize: 13 }} onClick={async () => { const name = window.prompt('Name this passkey', k.name)?.trim(); if (!name || name === k.name) return; try { await api(`/me/passkeys/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: { name } }); list.reload(); ctx.toast('Passkey renamed'); } catch (e) { setErr((e as Error).message); } }}>Rename</button>
            <button style={{ color: 'oklch(0.75 0.14 28)', fontSize: 13 }} onClick={async () => { if (!window.confirm(`Remove “${k.name}”?`)) return; await api(`/me/passkeys/${encodeURIComponent(k.id)}`, { method: 'DELETE' }); list.reload(); onChange(); }}>Remove</button>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function useProfile(ctx: Ctx): Section {
  const p = useApi<P>('/profile');
  const prefs = usePrefs('user');
  const { refreshMe } = useStore();
  const theme = useTheme();
  const save = async (body: object) => { try { await api('/profile', { method: 'PUT', body }); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } p.reload(); refreshMe(); };
  const d = p.data;
  const countries = d?.country && !COUNTRIES.includes(d.country) ? [d.country, ...COUNTRIES] : COUNTRIES;
  const details = () => ctx.modal(<Modal title="Your details" sub="Picture, name, country, seasons and time zone." width={620} onClose={close(ctx)}><Profile /></Modal>);
  return {
    key: 'profile', name: 'Profile', hint: 'How you appear to guests and on your portfolio.',
    groups: [
      { rows: [
        { id: 'avatar', t: 'link', avatar: { name: d?.displayName || ctx.me?.user?.name || '', src: d?.hasAvatar ? '/api/profile/avatar' : undefined }, label: 'Picture', hint: 'Shown to guests and on your portfolio.', meta: 'Change', act: details },
        { id: 'name', t: 'text', label: 'Display name', value: d?.displayName ?? '', ph: d?.signedInAs || 'Your name', set: (v) => void save({ displayName: v }) },
        { id: 'country', t: 'select', label: 'Country', hint: 'Sets your hemisphere, so photo seasons are right. Shown on your portfolio.', opts: countries, value: d?.country || 'Australia', set: (v) => void save({ country: v }) },
        { id: 'email', t: 'text', label: 'Email', hint: 'For sign-in and guest replies.', value: ctx.me?.user?.email ?? '', disabled: true },
      ] },
      { title: 'Preferences', rows: [
        { id: 'theme', t: 'seg', label: 'Theme', hint: 'Dark unless you change it.', opts: ['Dark', 'Light'], value: theme === 'light' ? 'Light' : 'Dark', set: (v) => { setTheme(v === 'Light' ? 'light' : 'dark'); ctx.toast('Saved'); } },
        { id: 'start', t: 'select', label: 'Open Frames on', opts: ['Home', 'Library', 'Shoots', 'Compositions'], value: prefs.get('start', 'Home'), set: (v) => { prefs.set('start', v); ctx.toast('Saved'); } },
        { id: 'units', t: 'seg', label: 'Print sizes in', opts: ['cm', 'inches'], value: prefs.get('units', 'cm'), set: (v) => { prefs.set('units', v); ctx.toast('Saved'); } },
        { id: 'dateFmt', t: 'select', label: 'Dates', opts: ['9 Nov 2026', '09/11/2026', '2026-11-09', 'Nov 9, 2026'], value: prefs.get('dateFmt', '9 Nov 2026'), set: (v) => { prefs.set('dateFmt', v); ctx.toast('Saved'); } },
      ] },
    ],
  };
}

/* ------------------------------------------------------------ Notifications */
type NP = { bell: Record<string, boolean>; email: Record<string, boolean>; quiet: { on: boolean; from: string; to: string }; tz: string; reviewReminder: 'off' | 'daily' | 'weekly' };
export function useNotifications(ctx: Ctx): Section {
  const d = useApi<{ prefs: NP }>('/notifications/prefs');
  const status = useApi<{ smtpHealthy: boolean }>('/config/status');
  const p = d.data?.prefs;
  const put = async (body: object) => { try { await api('/notifications/prefs', { method: 'PUT', body }); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } d.reload(); };
  const bell = (ks: string[]) => ({ value: !!p && ks.every((k) => p.bell[k] !== false), set: (v: boolean) => void put({ bell: Object.fromEntries(ks.map((k) => [k, v])) }) });
  const mail = (ks: string[]) => ({ value: !!p && ks.every((k) => !!p.email[k]), set: (v: boolean) => void put({ email: Object.fromEntries(ks.map((k) => [k, v])) }) });
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const emailOk = !!status.data?.smtpHealthy;
  return {
    key: 'notifications', name: 'Notifications', hint: 'What shows in the bell, and what gets emailed.',
    groups: [
      { title: 'Show in the bell', rows: [
        { id: 'nGuest', t: 'toggle', label: 'Guest ratings and suggestions', ...bell(['guest-suggestion', 'guest-reply']) },
        { id: 'nComm', t: 'toggle', label: 'Community reviews of my photos', ...bell(['community-rating']) },
        { id: 'nIdeas', t: 'toggle', label: 'Composition ideas', ...bell(['idea']) },
        { id: 'nSync', t: 'toggle', label: 'Cloud photos ready to organise', ...bell(['cloud-sync']) },
        { id: 'nDue', t: 'toggle', label: 'Photos due for review', ...bell(['review-due']) },
        { id: 'nReport', t: 'toggle', label: 'Outcomes of photos I reported', ...bell(['report-outcome']) },
      ] },
      { title: 'Email me', rows: [
        { id: 'notify', t: 'toggle', label: 'When a guest replies', hint: emailOk ? undefined : 'This server cannot send email right now.', ...mail(['guest-reply', 'guest-suggestion']) },
        { id: 'remind', t: 'select', label: 'Review reminders', hint: 'Only when photos are due.', opts: ['Off', 'Daily', 'Weekly'], value: cap(p?.reviewReminder ?? 'off'), set: (v) => void put({ reviewReminder: v.toLowerCase() }) },
        { id: 'digest', t: 'toggle', label: 'Monthly summary', hint: 'Photos added, rated and printed.', ...mail(['summary']) },
        { id: 'nEmailSec', t: 'toggle', label: 'New sign-ins to my account', hint: 'Always on for admins.', ...mail(['sign-in']), togDisabled: ctx.isAdmin ? 'Always on for admins' : undefined },
      ] },
      { title: 'Quiet hours', rows: [
        { id: 'quiet', t: 'toggle', label: 'Hold emails overnight', hint: `Sent at ${p?.quiet.to ?? '8am'} instead.`, value: !!p?.quiet.on, set: (v) => void put({ quiet: { on: v } }) },
      ] },
    ],
  };
}

/* ------------------------------------------------------------------ Reviews */
const SPACING = ['1 day', '3 days', '1 week', '2 weeks', '1 month', '3 months', '6 months', '1 year'];
const TODO: [string, string][] = [['Camera', 'camera'], ['Location', 'location'], ['Time', 'time'], ['Subjects', 'subjects'], ['Tags', 'tags'], ['Description', 'description'], ['Composition', 'composition'], ['Light', 'light'], ['Mood', 'mood']];
const SHARE: [string, string][] = [['Portfolio photos only', 'portfolio'], ['Photos rated 4 or more', 'rated4'], ['Any photo', 'any']];
export function useReviews(ctx: Ctx): Section {
  const { settings: s, setSettings } = useStore();
  const w = useApi<{ weight: number }>('/collections/guest-weight');
  const c = useApi<{ optIn: boolean; share: string; written: boolean; showOnHome: boolean }>('/community/prefs');
  const prefs = usePrefs('user');
  const sug = useApi<{ photos: unknown[] }>(s ? `/photos/delete-suggestions?b=${s.deleteBelow || 2}` : null);
  const save = async (patch: object) => { try { await setSettings(patch as never); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } };
  const cp = async (body: object) => { try { await api('/community/prefs', { method: 'PUT', body }); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } c.reload(); };
  const n = s?.sessions ?? 4;
  const seq = Array.from({ length: n }, (_, i) => s?.intervals[Math.min(i, (s?.intervals.length ?? 1) - 1)] ?? '1 week');
  const pct = (w.data?.weight ?? 35) + '%';
  const below = s?.deleteBelow ? s.deleteBelow.toFixed(1) : '2.0';
  const reasons = (s?.todoReasons ?? []).map((k) => TODO.find((t) => t[1] === k)?.[0]).filter((x): x is string => !!x);
  return {
    key: 'reviews', name: 'Reviews', hint: 'When photos come back for a rating.',
    groups: [
      { rows: [
        { id: 'sessions', t: 'stepper', label: 'Sessions per photo', hint: 'Each photo is rated this many times.', value: n, min: 1, max: 8, set: (v) => void save({ sessions: v }) },
        { id: 'spacing', t: 'seq', label: 'Spacing', hint: 'The wait before each next session. Click to change.', opts: SPACING, value: seq, set: (v) => void save({ intervals: v }) },
        { id: 'adapt', t: 'toggle', label: 'Adapt to consistency', hint: 'Steady ratings come back less often.', value: !!s?.adaptive, set: (v) => void save({ adaptive: v }) },
        { id: 'daily', t: 'stepper', label: 'Photos per review', hint: 'How many are offered at once.', value: s?.reviewSize ?? 12, min: 4, max: 60, step: 4, set: (v) => void save({ reviewSize: v }) },
        { id: 'scale', t: 'seg', label: 'Rating scale', opts: ['😐 → 😍', '★ 1–5'], value: s?.ratingStyle === 'stars' ? '★ 1–5' : '😐 → 😍', set: (v) => void save({ ratingStyle: v.startsWith('★') ? 'stars' : 'emoji' }) },
        { id: 'blind', t: 'toggle', label: 'Hide scores while rating', hint: 'Keeps each rating independent.', value: prefs.get('blind', true), set: (v) => { prefs.set('blind', v); ctx.toast('Saved'); } },
      ] },
      { title: 'Ranking', rows: [
        { id: 'weight', t: 'seg', label: 'Guest ratings count for', hint: 'In composition rankings.', opts: ['0%', '20%', '35%', '50%'], value: pct, set: async (v: string) => { try { await api('/collections/guest-weight', { method: 'PUT', body: { weight: parseInt(v, 10) } }); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } w.reload(); } },
        { id: 'newBoost', t: 'toggle', label: 'Review new shoots first', hint: 'Fresh photos jump the queue.', value: s?.newShootsFirst !== false, set: (v) => void save({ newShootsFirst: v }) },
      ] },
      { title: 'Community', rows: [
        { id: 'community', t: 'toggle', label: 'Let other Frames users review my photos', hint: 'Anonymous both ways. Their scores stay separate from yours and your guests’.', note: 'Photos tagged nudity, violence or adult are never shown to the community.', value: !!c.data?.optIn, set: (v) => void cp({ optIn: v }) },
        { id: 'commFrom', t: 'select', label: 'Share', dep: 'community', opts: SHARE.map((x) => x[0]), value: SHARE.find((x) => x[1] === c.data?.share)?.[0] ?? 'Any photo', set: (v) => void cp({ share: SHARE.find((x) => x[0] === v)![1] }) },
        { id: 'commNotes', t: 'toggle', label: 'Allow written feedback', dep: 'community', value: !!c.data?.written, set: (v) => void cp({ written: v }) },
        { id: 'commHome', t: 'toggle', label: 'Show Community review on Home', hint: 'Rate other photographers’ work.', value: !!c.data?.showOnHome, set: (v) => void cp({ showOnHome: v }) },
      ] },
      { title: 'Clean-up', rows: [
        { id: 'suggestRemove', t: 'toggle', label: 'Suggest removing low-rated photos', hint: 'After every session. Nothing is removed without asking.', value: !!s?.archiveSuggest, set: (v) => void save({ archiveSuggest: v }) },
        { id: 'removeBelow', t: 'select', label: 'Averaging below', dep: 'suggestRemove', opts: ['1.0', '1.5', '2.0', '2.5', '3.0'], value: below, set: (v) => void save({ deleteBelow: Number(v) }) },
        { id: 'removeVotes', t: 'select', label: 'Over at least', hint: 'Ratings from you and guests combined.', dep: 'suggestRemove', opts: ['3 votes', '5 votes', '8 votes', '12 votes', '20 votes'], value: prefs.get('removeVotes', '5 votes'), set: (v) => { prefs.set('removeVotes', v); ctx.toast('Saved'); } },
        { id: 'suggested', t: 'link', label: 'Suggested now', dep: 'suggestRemove', meta: `${sug.data?.photos.length ?? 0} photos`, act: () => s && ctx.modal(<Modal title="Suggested for removal" sub="Photos whose average is below your line. Nothing is removed until you tick and confirm." width={720} onClose={close(ctx)}><DeleteSuggestions s={s} save={async (p) => save(p)} /></Modal>) },
        { id: 'leaveOut', t: 'toggle', label: 'Suggest leaving low-rated photos out of review', hint: 'They stay in your library and compositions.', value: prefs.get('leaveOut', false), set: (v) => { prefs.set('leaveOut', v); ctx.toast('Saved'); } },
      ] },
      { title: 'To do list counts photos missing', rows: [
        { id: 'todo', t: 'chips', label: 'Missing', opts: TODO.map((t) => t[0]), value: reasons, set: (v: string[]) => void save({ todoReasons: v.map((x) => TODO.find((t) => t[0] === x)![1]) }) },
      ] },
    ],
  };
}

/* -------------------------------------------------------------------- Tags */
export function useTags(ctx: Ctx): Section {
  const subj = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const prefs = usePrefs('user');
  const hidden = prefs.get<string[]>('hidden', []);
  const manage = () => ctx.modal(<Modal title="Tags & subjects" sub="Create, rename, merge or delete tags and subjects." width={640} onClose={() => { ctx.modal(null); subj.reload(); }}><Vocabulary /></Modal>);
  return {
    key: 'tags', name: 'Tags & subjects', hint: 'How photos get described and found.',
    groups: [
      { title: 'Subjects', rows: [
        { id: 'aiSubjects', t: 'toggle', label: 'Suggest subjects with AI', hint: 'Suggestions wait for you to accept.', value: prefs.get('aiSubjects', true), set: (v) => { prefs.set('aiSubjects', v); ctx.toast('Saved'); } },
        { id: 'autoAccept', t: 'select', label: 'Accept automatically above', dep: 'aiSubjects', opts: ['Never', '80% sure', '90% sure', '95% sure'], value: prefs.get('autoAccept', '95% sure'), set: (v) => { prefs.set('autoAccept', v); ctx.toast('Saved'); } },
        { id: 'subjects', t: 'button', label: 'Tags & subjects', hint: 'Create, search, rename, merge or delete in one list.', meta: 'Manage tags', act: manage },
      ] },
      { title: 'Sensitive content', rows: [
        { id: 'sensAiLink', t: 'link', label: 'Flag sensitive photos with AI', hint: 'Set which AI does this in AI → Which AI does what.', meta: 'AI settings', act: () => ctx.goto('lib', 'ai') },
        { id: 'sensBlur', t: 'toggle', label: 'Blur flagged photos for guests', hint: 'They click to reveal.', value: prefs.get('sensBlur', true), set: (v) => { prefs.set('sensBlur', v); ctx.toast('Saved'); } },
        { id: 'sensPf', t: 'toggle', label: 'Keep flagged photos off my portfolio', value: prefs.get('sensPf', false), set: (v) => { prefs.set('sensPf', v); ctx.toast('Saved'); } },
        { id: 'sensList', t: 'link', label: 'Flagged photos', hint: 'Never shown in community review.', meta: 'See them', act: () => { window.location.assign('/library?tag=adult'); } },
      ] },
      { title: 'Tags', rows: [
        { id: 'autoTags', t: 'chips', label: 'Tag automatically from', opts: ['Camera', 'Lens', 'Film', 'Place', 'Season'], value: prefs.get<string[]>('autoTags', ['Camera', 'Film', 'Place']), set: (v: string[]) => { prefs.set('autoTags', v); ctx.toast('Saved'); } },

        { id: 'hidden', t: 'pills', label: 'Hidden tags', hint: 'Never shown to guests or on the portfolio.', value: hidden, addAs: 'private', set: (v: string[]) => { prefs.set('hidden', v); ctx.toast('Saved'); } },

      ] },
    ],
  };
}

/* --------------------------------------------------------------- Camera & XMP */
export function useXmp(ctx: Ctx): Section {
  const { settings: s, setSettings } = useStore();
  const prefs = usePrefs('user');
  const save = async (patch: object) => { try { await setSettings(patch as never); ctx.toast('Saved'); } catch (e) { ctx.toast(msg(e)); } };
  const g = s?.gear;
  return {
    key: 'xmp', name: 'Camera & XMP', hint: 'What Frames writes back to your files.',
    groups: [
      { title: 'XMP sidecars', rows: [
        { id: 'xmpRatings', t: 'toggle', label: 'Write ratings', hint: 'Lightroom and Capture One will see them.', value: !!s?.xmpWriteBack, set: (v) => void save({ xmpWriteBack: v }) },
        { id: 'xmpMap', t: 'select', label: 'Map scores to', dep: 'xmpRatings', opts: ['Stars (1–5)', 'Colour labels', 'Both'], value: prefs.get('xmpMap', 'Stars (1–5)'), set: (v) => { prefs.set('xmpMap', v); ctx.toast('Saved'); } },
        { id: 'xmpTags', t: 'toggle', label: 'Write tags and subjects', value: prefs.get('xmpTags', true), set: (v) => { prefs.set('xmpTags', v); ctx.toast('Saved'); } },
        { id: 'xmpRead', t: 'toggle', label: 'Read edits from other apps', hint: 'Keeps keywords in sync both ways.', value: prefs.get('xmpRead', false), set: (v) => { prefs.set('xmpRead', v); ctx.toast('Saved'); } },
      ] },
      { title: 'Cameras', rows: [
        { id: 'camGear', t: 'button', label: 'Your cameras and lenses', hint: 'Managed on the Gear page. Cameras found in your photos are suggested there.', meta: 'Open gear →', act: () => window.location.assign('/gear') },
        { id: 'film', t: 'text', label: 'Default film stock', hint: 'For scans without camera data.', value: g?.film ?? '', ph: 'Portra 400', set: (v) => void save({ gear: { ...(g ?? { camera: '', lens: '', medium: '' }), film: v, medium: v ? 'film' : (g?.medium ?? '') } }) },
        { id: 'filmTag', t: 'toggle', label: 'Ask for the film on new scans', value: prefs.get('filmTag', true), set: (v) => { prefs.set('filmTag', v); ctx.toast('Saved'); } },
      ] },
    ],
    after: s ? <XmpMore s={s} save={save} ctx={ctx} /> : null,
  };
}

/** The XMP actions the old page had: export everything now, and settle differences with other apps. */
function XmpMore({ s, save, ctx }: { s: NonNullable<ReturnType<typeof useStore>['settings']>; save: (p: object) => Promise<void>; ctx: Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' }}>Export and differences</span>
      <div style={{ background: '#161615', borderRadius: 12, padding: '4px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '14px 0' }}>
          <div><div style={{ fontSize: 14.5 }}>Export approved metadata</div><div style={{ fontSize: 12.5, color: '#8f8c86' }}>Titles, descriptions, accepted tags and average ratings, as XMP sidecars.</div></div>
          <span role="button" tabIndex={0} className="sbtn" onClick={() => ctx.modal(<Modal title="Export and differences" width={680} onClose={() => ctx.modal(null)}><Metadata s={s} save={async (p) => save(p)} /></Modal>)} style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)', fontSize: 13.5, cursor: 'pointer' }}>Open…</span>
        </div>
      </div>
    </div>
  );
}

export function useSecurity(ctx: Ctx): Section {
  const ids = useApi<{ identities: { id: number; provider: string; email: string }[] }>(ctx.me?.user ? '/me/identities' : null);
  const methods = useApi<{ methods: { id: string; label: string; kind: string; state: string; count?: number; canUnlink?: boolean }[] }>(ctx.me?.user ? '/me/sign-in-methods' : null);
  const activity = useApi<{ sessions: { id: string; created: string; ip: string; userAgent: string; current: boolean }[]; history: { id: string; created: string; ip: string; userAgent: string; active: boolean }[] }>(ctx.me?.user ? '/me/security' : null);
  const revoke = async (id: string, current: boolean) => {
    if (!window.confirm(current ? 'Sign out of this browser?' : 'Sign out this session?')) return;
    try { await api(`/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (current) window.location.assign('/signin'); else { activity.reload(); ctx.toast('Session signed out'); } }
    catch (e) { ctx.toast(msg(e)); }
  };
  const linked = new URLSearchParams(window.location.search).get('linked');
  const linkNotice: Record<string, string> = { ok: 'Sign-in method linked.', same: 'That account is already linked to you.', taken: 'That account belongs to someone else.', notallowed: 'That account is not allowed to sign in here.' };
  return { key: 'security', name: 'Password & security', hint: 'Your sign-in methods, active sessions and recent sign-ins.', notice: linked ? linkNotice[linked] : undefined, groups: [
      { title: 'Sign-in methods · the ones your admin turned on', rows: (methods.data?.methods ?? []).map((m): R => {
        if (m.kind === 'email') return { id: 'sm_email', t: 'link', label: m.label, hint: 'Always on. A code is emailed to you when you sign in.' };
        if (m.kind === 'passkey') return { id: 'sm_passkey', t: 'button', label: m.label, hint: m.count ? `${m.count} ${m.count === 1 ? 'device' : 'devices'}` : 'Sign in with a fingerprint, face or device PIN', meta: 'Manage', act: () => ctx.modal(<Passkeys ctx={ctx} onChange={() => methods.reload()} />) };
        if (m.kind === 'access') return { id: 'sm_access', t: 'link', label: m.label, hint: 'Automatic. Cloudflare signs you in.' };
        const idn = ids.data?.identities.find((i) => i.provider === m.id);
        return m.state === 'linked'
          ? { id: `sm_${m.id}`, t: 'button', label: m.label, hint: idn?.email ? `Linked · ${idn.email}` : 'Linked', meta: m.canUnlink ? 'Unlink' : 'In use', act: async () => { if (!m.canUnlink || !idn) return; if (!window.confirm(`Stop signing in with ${m.label}?`)) return; await api(`/me/identities/${idn.id}`, { method: 'DELETE' }); methods.reload(); ids.reload(); ctx.toast('Unlinked'); } }
          : { id: `sm_${m.id}`, t: 'button', label: m.label, hint: 'Not linked', meta: 'Link', act: () => window.location.assign(`/auth/link/${m.id}`) };
      }) },
      { title: 'Active sessions', rows: !ctx.me?.user ? [{ id: 'sessionRequired', t: 'link', label: 'Sign in with a personal account to manage sessions', hint: 'Shared-password and automatic access do not create personal sessions.' }] : activity.error ? [{ id: 'sessionError', t: 'button', label: activity.error, meta: 'Retry', act: activity.reload }] : !activity.data ? [{ id: 'sessionLoading', t: 'link', label: 'Loading sessions…' }] : activity.data.sessions.length ? activity.data.sessions.map((s): R => ({ id: `session_${s.id}`, t: 'button', label: `${s.current ? 'This browser · ' : ''}${s.ip || 'IP not recorded'}`, hint: `${s.userAgent || 'Device not recorded'} · Signed in ${new Date(s.created).toLocaleString()}`, meta: 'Sign out', act: () => void revoke(s.id, s.current) })) : [{ id: 'noSessions', t: 'link', label: 'No recorded active sessions' }] },
      { title: 'Recent sign-ins', meta: 'Latest 100', rows: (activity.data?.history ?? []).map((s): R => ({ id: `history_${s.id}`, t: 'link', label: `${new Date(s.created).toLocaleString()} · ${s.ip || 'IP not recorded'}`, hint: `${s.userAgent || 'Device not recorded'} · ${s.active ? 'Active' : 'Signed out or expired'}` })) },
    ] };
}
