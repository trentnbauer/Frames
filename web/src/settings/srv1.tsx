import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { parseSize, showSize } from './size';
import { Modal } from '../components/Modal';
import { Access } from '../pages/Access';
import { CloudServices } from '../pages/CloudSettings';
import { People } from '../pages/People';
import { fmtDate } from '../data';
import { useStore } from '../store';
import { usePrefs } from './hooks';
import { AddAi } from './lib2';
import type { Ctx } from './sections';
import type { R, Section } from './ui';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'That did not work.');
const close = (ctx: Ctx) => () => ctx.modal(null);
const act = async (ctx: Ctx, fn: () => Promise<unknown>, ok = 'Saved') => { try { await fn(); ctx.toast(ok); } catch (e) { ctx.toast(msg(e)); } };
const gb = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : n >= 1e9 ? `${Math.round(n / 1e9)} GB` : n >= 1e6 ? `${Math.max(1, Math.round(n / 1e6))} MB` : `${Math.round(n / 1e3)} KB`);
const ROLE: Record<string, string> = { admin: 'Admin', member: 'Member', guest: 'Guest only' };
const ROLES = ['Admin', 'Member', 'Guest only'];
const roleKey = (l: string) => Object.entries(ROLE).find((e) => e[1] === l)![0];
type Inst = Record<string, any>;

/* ------------------------------------------------------------ Sign-in */
type Prov = { id: string; type: string; name: string; hasSecret?: boolean; off?: boolean };
const METHODS: [string, string, string, string, string, string][] = [
  ['passkey', 'PK', 'Passkey', 'Face ID, Touch ID or a security key. Built in.', '', ''],
  ['cloudflare', 'CF', 'Cloudflare Access', 'No sign-in screen: Access vouches for the email.', 'cloudflare', 'No team domain yet'],
  ['google', 'G', 'Google', 'Sign in with a Google account.', 'google', 'No client ID yet'],
  ['github', 'GH', 'GitHub', 'Sign in with a GitHub account.', 'github', 'No client ID yet'],
  ['dropbox', 'DB', 'Dropbox', 'Sign in with a Dropbox account.', 'dropbox', 'No app key yet'],
  ['microsoft', 'MS', 'Microsoft', 'Work or school (Entra ID). Needs your tenant ID.', 'microsoft', 'No tenant ID yet'],
  ['oidc', 'ID', 'OpenID Connect', 'Authentik, Keycloak, Authelia or any OIDC server.', 'oidc', 'Issuer address not set'],
  ['oauth2', 'O2', 'Other OAuth 2', 'Anything that gives out OAuth 2 tokens.', 'oauth2', 'Token address not set'],
];
const SESSION: [string, number][] = [['1 day', 1], ['1 week', 7], ['30 days', 30], ['90 days', 90]];
const EXPIRY: [string, number][] = [['1 week', 7], ['3 weeks', 21], ['3 months', 90], ['Never', 0]];

export function useSignin(ctx: Ctx): Section {
  const a = useApi<{ enabled: boolean; providers: Prov[]; testedBy: { provider: string } | null; publicUrl: string }>('/auth/config');
  const inst = useApi<Inst>('/admin/instance');
  const ts = useApi<{ enabled: boolean; siteKey: string; signin: boolean; shares: boolean; hasSecret: boolean; disabledByEnv: boolean }>('/admin/turnstile');
  const saveTs = async (body: object, ok: string) => { await act(ctx, () => api('/admin/turnstile', { method: 'PUT', body }), ok); ts.reload(); };
  const reload = () => { a.reload(); inst.reload(); ts.reload(); };
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); };
  const i = inst.data;
  const configure = (type?: string) => ctx.modal(<Modal title="Sign-in methods" sub="Set up, test and remove each method." width={760} onClose={() => { ctx.modal(null); reload(); }}><Access focus={type} /></Modal>);
  const rows: R[] = METHODS.map(([k, icon, label, hint, type, fail]) => {
    const p = a.data?.providers.find((x) => x.type === type);
    const on = k === 'passkey' ? true : !!p && !p.off;
    const tested = !!p && a.data?.testedBy?.provider === p.id;
    return {
      id: `m_${k}`, t: 'method', icon, label, hint, value: on, togDisabled: k === 'passkey' ? 'Built in: people add passkeys under Settings, Profile' : undefined,
      method: {
        on, configured: !!p, builtIn: k === 'passkey', test: tested || on ? 'pass' : 'none', failWith: fail, configure: () => (k === 'passkey' ? ctx.goto('lib', 'profile') : configure(type)),
        setOn: async (v) => { if (!p) { ctx.toast(`Set up ${label} first: press Configure`); return; } await act(ctx, () => api(`/auth/methods/${p.id}`, { method: 'PUT', body: { on: v } })); a.reload(); },
        runTest: () => { if (!p) { ctx.toast(`${fail} · press Configure`); return; } window.location.assign(`/auth/login/${p.id}?test=1`); },
      },
    };
  });
  const closeSess = (n: number) => SESSION.find((s) => s[1] === n)?.[0] ?? `${n} days`;
  return {
    key: 'signin', name: 'Sign-in & access', hint: 'How people get in.',
    groups: [
      { title: 'Sign-in methods · test before turning on', rows },
      { title: 'Sessions', rows: [
        { id: 'signup', t: 'toggle', label: 'Allow anyone to sign up', hint: 'Off: invite only.', value: !!i?.signups, togDisabled: i?.signupsLocked ? 'Set by ALLOW_SIGNUPS on this server' : undefined, set: (v) => void put({ signups: v }) },
        { id: 'newRole', t: 'select', label: 'New people join as', opts: ROLES, value: ROLE[i?.defaultRole ?? 'member'], set: (v) => void put({ defaultRole: roleKey(v) }) },
        { id: 'session', t: 'select', label: 'Stay signed in for', opts: [...SESSION.map((s) => s[0]), ...(i && !SESSION.some((s) => s[1] === i.sessionDays) ? [closeSess(i.sessionDays)] : [])], value: closeSess(i?.sessionDays ?? 14), set: (v) => { const n = SESSION.find((s) => s[0] === v)?.[1]; if (n) void put({ sessionDays: n }); } },
      ] },
      { title: 'Guest links', rows: [
        { id: 'guestExpiry', t: 'select', label: 'Expire after', opts: EXPIRY.map((e) => e[0]), value: EXPIRY.find((e) => e[1] === i?.shareExpireDays)?.[0] ?? '3 weeks', set: (v) => void put({ shareExpireDays: EXPIRY.find((e) => e[0] === v)![1] }) },
        { id: 'guestDl', t: 'toggle', label: 'Guests can download files', value: !!i?.shareDownload, set: (v) => void put({ shareDownload: v }) },
        { id: 'guestName', t: 'toggle', label: 'Ask guests for their name', hint: 'So you know whose ratings are whose.', value: i?.shareAskName !== false, set: (v) => void put({ shareAskName: v }) },
      ] },
      { title: 'Bot check · Cloudflare Turnstile', rows: [
        { id: 'tsOn', t: 'toggle', label: 'Use the bot check', hint: ts.data?.disabledByEnv ? 'Switched off by TURNSTILE_DISABLE=true on this server. Remove that setting and restart to use it.' : 'Ask people to pass a short check, run by Cloudflare, before they sign in or open a share link. If Cloudflare cannot be reached, or does not accept the secret key, people are let through rather than locked out.', value: !!ts.data?.enabled, togDisabled: ts.data?.disabledByEnv ? 'Switched off by TURNSTILE_DISABLE=true on this server' : undefined, set: (v: boolean) => void saveTs({ enabled: v }, v ? 'The bot check is on' : 'The bot check is off') },
        { id: 'tsSite', t: 'text', label: 'Site key', hint: 'From your Turnstile widget in the Cloudflare dashboard. A wrong site key cannot be detected: if the check stops showing, start Frames with TURNSTILE_DISABLE=true and correct the keys.', dep: 'tsOn', value: ts.data?.siteKey ?? '', ph: '0x4AAAAAAA…', set: (v: string) => void saveTs({ siteKey: v }, 'Site key saved') },
        { id: 'tsSecret', t: 'text', label: 'Secret key', hint: 'Never shown again.', dep: 'tsOn', inputType: 'password', value: '', ph: ts.data?.hasSecret ? 'Saved. Type to replace' : '0x4AAAAAAA…', set: (v: string) => { if (v.trim()) void saveTs({ secret: v }, 'Secret key saved'); } },
        { id: 'tsSignin', t: 'toggle', label: 'On the sign-in page', dep: 'tsOn', value: !!ts.data?.signin, set: (v: boolean) => void saveTs({ signin: v }, 'Saved') },
        { id: 'tsShares', t: 'toggle', label: 'On share links', hint: 'A signed-in person is not asked.', dep: 'tsOn', value: !!ts.data?.shares, set: (v: boolean) => void saveTs({ shares: v }, 'Saved') },
      ] },
      { title: 'Access control', rows: [
        { id: 'requireSignin', t: 'toggle', label: 'Require sign-in', hint: 'Off: anyone who can reach Frames can use it. Test a method first.', value: !!a.data?.enabled, set: async (v: boolean) => { await act(ctx, () => api('/auth/config', { method: 'PUT', body: { enabled: v } })); a.reload(); } },
        { id: 'allowList', t: 'link', label: 'Who is allowed in and the public address', hint: 'The allowed list and the address sign-in comes back to.', meta: 'Open', act: () => configure() },
      ] },
    ],
  };
}

/* ------------------------------------------------------------ Members */
type U = { id: number; name: string; email: string; role: 'admin' | 'member' | 'guest'; disabled: boolean; invited: boolean; created: string; photos: number; bytes: number };
function Invite({ ctx, reload }: { ctx: Ctx; reload: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const send = async () => { try { await api('/admin/users', { body: { email: email.trim(), role: roleKey(role), note } }); ctx.toast(`Invite sent to ${email.trim()} · added to the allowed list`); ctx.modal(null); reload(); } catch (e) { setErr(msg(e)); } };
  return (
    <Modal title="Invite someone" sub="They are added to the allowed list and sent an email if email is set up." width={540} onClose={close(ctx)} foot={<><span className="grow" /><button className="btn primary" disabled={!ok} onClick={() => void send()}>Send invite</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <input className="field-in" autoFocus value={email} placeholder="name@example.com" aria-label="Email address" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ok) void send(); }} />
        <div className="seg" role="group" aria-label="Role" style={{ alignSelf: 'flex-start' }}>{ROLES.map((r) => <button key={r} className={role === r ? 'on' : ''} aria-pressed={role === r} onClick={() => setRole(r)}>{r}</button>)}</div>
        <div style={{ fontSize: 12.5, color: '#8f8c86' }}>{{ Admin: 'Everything, including these server settings.', Member: 'Their own library, shoots and compositions.', 'Guest only': 'Only sees compositions shared with them. Can rate and suggest.' }[role]}</div>
        <textarea className="field-in" rows={3} value={note} placeholder="Add a note…" aria-label="A note" onChange={(e) => setNote(e.target.value)} />
        {err && <div role="alert" style={{ fontSize: 13, color: 'oklch(0.75 0.14 28)' }}>{err}</div>}
      </div>
    </Modal>
  );
}

export function useMembers(ctx: Ctx): Section {
  const d = useApi<{ users: U[] }>('/admin/users');
  const sys = useApi<{ dataDisk: { total: number; free: number } }>('/admin/system');
  const inst = useApi<Inst>('/admin/instance');
  const { me } = useStore();
  const users = d.data?.users ?? [];
  const total = users.reduce((n, u) => n + u.bytes, 0);
  const disk = sys.data?.dataDisk;
  const first = (u: U) => (u.name || u.email).split(' ')[0];
  const manage = () => ctx.modal(<Modal title="Manage people" sub="Folders, switching someone off, deleting their data, the privacy page and reports." width={760} onClose={() => { ctx.modal(null); d.reload(); }}><People /></Modal>);
  return {
    key: 'people', name: 'Members', hint: 'Who can sign in to this Frames.',
    action: { label: '+ Invite', act: () => ctx.modal(<Invite ctx={ctx} reload={d.reload} />) },
    groups: [
      { title: 'Members', rows: [
        { id: 'pStorage', t: 'meter', label: 'Storage used', hint: users.filter((u) => u.bytes > 0).map((u) => `${first(u)} ${gb(u.bytes)}`).join(' · ') || 'Nothing yet', pct: disk?.total ? ((disk.total - disk.free) / disk.total) * 100 : 0, text: disk?.total ? `${gb(disk.total - disk.free)} of ${gb(disk.total)}` : gb(total) },
        ...users.map((u): R => ({
          id: `u${u.id}`, t: 'select', icon: (u.name || u.email).split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase(), label: u.name || u.email,
          hint: `${u.email}${u.id === me?.id ? ' · you' : u.invited ? ` · invited ${fmtDate(u.created, { day: 'numeric', month: 'short' })}` : ''}${u.disabled ? ' · switched off' : ''}${u.role === 'guest' ? ' · guests store nothing' : ` · ${gb(u.bytes)} · ${u.photos.toLocaleString()} photos`}`,
          opts: ROLES, value: ROLE[u.role], set: async (v: string) => { await act(ctx, () => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role: roleKey(v) } })); d.reload(); },
        })),
      ] },
      { title: 'Defaults', rows: [
        { id: 'shareLib', t: 'toggle', label: 'Members can see each other’s shoots', value: !!inst.data?.membersSeeShoots, set: async (v: boolean) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body: { membersSeeShoots: v } })); inst.reload(); } },
        { id: 'manage', t: 'link', label: 'Folders, switching off, deleting data, privacy page', hint: 'Per-person tools and the page everyone can read about their data.', meta: 'Manage people', act: manage },
      ] },
    ],
  };
}

/* ------------------------------------------------- Photos & storage */
const PREVIEW: [string, number][] = [['1600 px', 1600], ['2400 px', 2400], ['3072 px', 3072], ['4096 px', 4096]];
const QUALITY = [70, 75, 80, 85, 88, 90, 95];
const WHO: [string, string][] = [['Admins and members', 'members'], ['Admins only', 'admins']];
const SYNC: [string, number][] = [['Every 15 min', 15], ['Every hour', 60], ['Every 6 hours', 360]];
const QUOTA: [string, number][] = [['50 GB', 50], ['200 GB', 200], ['500 GB', 500], ['No limit', 0]];
const OTHER_PROV: [string, string, string, string][] = [['cpIcloud', 'iC', 'iCloud shared albums', 'Public shared-album links only. No sign-in needed.'], ['cpS3', 'S3', 'S3-compatible', 'AWS S3, Backblaze B2, Cloudflare R2, MinIO.'], ['cpWebdav', 'WD', 'WebDAV / Nextcloud', 'Members enter their own server address.'], ['cpSmb', 'SM', 'Network share (SMB)', 'A NAS folder on your network.']];
export function useFolders(ctx: Ctx): Section {
  const info = useApi<{ internalDir: string; libraries: { path: string }[] }>('/settings');
  const sys = useApi<{ libraryDisk: { path: string; total: number; free: number } }>('/admin/system');
  const inst = useApi<Inst>('/admin/instance');
  const xmp = useApi<{ location: 'next' | 'folder' }>('/admin/xmp-location');
  const conv = useApi<{ running: boolean; done: number; total: number; converted: number; outdated: number }>('/admin/convert-all');
  useEffect(() => { if (!conv.data?.running) return; const t = setInterval(conv.reload, 1500); return () => clearInterval(t); }, [conv.data?.running]); // eslint-disable-line react-hooks/exhaustive-deps
  const orig = useApi<{ allow: boolean }>('/admin/cloud-originals');
  const cl = useApi<{ providers: { id: string; label: string; configured: boolean; clientId?: string; hasSecret?: boolean }[]; redirectUri: string }>('/cloud');
  const prefs = usePrefs('server');
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); };
  const libs = (info.data?.libraries ?? []).filter((l) => l.path !== info.data?.internalDir);
  const dk = sys.data?.libraryDisk;
  const manage = () => ctx.modal(<Modal title="Cloud providers" sub="The app you registered with each service." width={720} onClose={() => { ctx.modal(null); cl.reload(); }}><CloudServices /></Modal>);
  const provs = cl.data?.providers ?? [];
  const ABBR: Record<string, string> = { google: 'GD', dropbox: 'DB', onedrive: 'OD' };
  const mRows: R[] = [
    ...provs.map((p): R => ({ id: `cp_${p.id}`, t: 'method', icon: ABBR[p.id] ?? p.id.slice(0, 2).toUpperCase(), label: p.label, hint: p.configured ? `Uses your ${p.label} app · client ID set` : 'Needs an app ID.', value: p.configured, togDisabled: 'Set or clear the app under Configure', method: { on: p.configured, configured: p.configured, test: p.configured ? 'pass' : 'none', failWith: 'App ID not set', configure: manage, setOn: () => ctx.toast('Set or clear the app under Configure'), runTest: () => ctx.toast(p.configured ? `${p.label} is set up` : 'App ID not set · press Configure') } })),
    ...OTHER_PROV.map(([id, icon, label, hint]): R => ({ id, t: 'method', icon, label, hint, value: false, togDisabled: 'Not in this version of Frames', method: { on: false, test: 'none', failWith: 'Not available', configure: () => ctx.toast(`${label} is not in this version of Frames`), setOn: () => ctx.toast(`${label} is not in this version of Frames`), runTest: () => ctx.toast(`${label} is not in this version of Frames`) } })),
  ];
  const details: R[] = provs.flatMap((p): R[] => [
    { id: `cpId_${p.id}`, t: 'text', label: `${p.label} app ID`, dep: `cp_${p.id}`, value: p.clientId ?? '', set: async (v: string) => { await act(ctx, () => api(`/cloud/client/${p.id}`, { method: 'PUT', body: { clientId: v } })); cl.reload(); } },
    { id: `cpSec_${p.id}`, t: 'text', label: `${p.label} client secret`, dep: `cp_${p.id}`, inputType: 'password', value: '', ph: p.hasSecret ? 'Saved. Type to replace' : 'Paste the secret', set: async (v: string) => { if (v) { await act(ctx, () => api(`/cloud/client/${p.id}`, { method: 'PUT', body: { clientSecret: v } })); cl.reload(); } } },
  ]);
  return {
    key: 'folders', name: 'Photos & storage', hint: 'Where originals live, and the cloud services members can bring photos in from.',
    groups: [
      { rows: [
        { id: 'libPath', t: 'text', label: 'Library folder', hint: 'Set with LIBRARY_DIRS.', value: libs[0]?.path ?? '', disabled: true },
        { id: 'disk', t: 'meter', label: 'Disk', hint: dk?.path, pct: dk?.total ? ((dk.total - dk.free) / dk.total) * 100 : 0, text: dk?.total ? `${gb(dk.total - dk.free)} of ${gb(dk.total)}` : '' },
        { id: 'watch', t: 'toggle', label: 'Watch for new files', hint: 'Shows “new files” on Shoots.', value: prefs.get('watch', true), set: (v) => { prefs.set('watch', v); ctx.toast('Saved'); } },
        { id: 'formats', t: 'chips', label: 'Import', opts: ['JPEG', 'HEIC', 'TIFF', 'RAW'], value: prefs.get<string[]>('formats', ['JPEG', 'HEIC', 'TIFF', 'RAW']), set: (v: string[]) => { prefs.set('formats', v); ctx.toast('Saved'); } },
      ] },
      { title: 'XMP sidecars', rows: [
        { id: 'sidecar', t: 'seg', label: 'Where sidecar files go', hint: 'For everyone on this server. Next to photo is what Lightroom and Capture One expect.', opts: ['Next to photo', 'Frames folder'], value: xmp.data?.location === 'folder' ? 'Frames folder' : 'Next to photo', set: async (v: string) => { await act(ctx, () => api('/admin/xmp-location', { method: 'PUT', body: { location: v === 'Frames folder' ? 'folder' : 'next' } })); xmp.reload(); } },
      ] },
      { title: 'Originals', rows: [
        { id: 'allowOrig', t: 'toggle', label: 'Allow original downloads on portfolios', value: !!inst.data?.allowOriginals, set: (v) => void put({ allowOriginals: v }) },
        { id: 'srvFullRes', t: 'toggle', label: 'Allow original resolution from the cloud', hint: 'Off: everyone’s cloud imports are saved as 4096 px copies to save disk space.', value: !!orig.data?.allow, set: async (v: boolean) => { await act(ctx, () => api('/admin/cloud-originals', { method: 'PUT', body: { allow: v } })); orig.reload(); } },
        { id: 'cloudOnly', t: 'toggle', label: 'Keep originals in cloud storage only', hint: 'Frees disk space on this server. Nothing in the cloud is touched.', value: !!inst.data?.cloudOnly, set: (v) => { if (v && !window.confirm('Require originals to be kept in cloud storage?\n\nNobody will be able to upload to Frames, and every cloud photo is kept only as a smaller copy here. Deleting a photo from the cloud deletes its only full-size original.')) return; void put({ cloudOnly: v }); } },
      ] },
      { title: 'Previews', rows: [
        { id: 'previewSize', t: 'select', label: 'Largest preview', hint: 'The most pixels any photo’s preview can have on this server. Everyone can choose smaller in their own settings.', opts: PREVIEW.map((p) => p[0]), value: PREVIEW.find((p) => p[1] === inst.data?.previewPx)?.[0] ?? '2400 px', set: (v) => void put({ previewPx: PREVIEW.find((p) => p[0] === v)![1] }) },
        { id: 'previewQuality', t: 'select', label: 'Highest preview quality', hint: 'JPEG quality, 70 to 95. Lower makes smaller files; 85 is hard to tell apart on screen. Everyone can choose lower.', opts: QUALITY.map(String), value: String(inst.data?.previewQuality ?? 90), set: (v) => void put({ previewQuality: Number(v) }) },
        { id: 'convertAll', t: 'button', label: 'Convert everyone’s previews', hint: conv.data?.running ? `Converting… ${conv.data.done.toLocaleString()} of ${conv.data.total.toLocaleString()}` : (conv.data?.outdated ?? 0) > 0 ? `${conv.data!.outdated.toLocaleString()} preview${conv.data!.outdated === 1 ? ' was' : 's were'} made to other standards (a new size or quality limit, or a person’s own setting). Converts them to what is allowed now. Originals are not touched.` : 'Every preview matches the current standards.', meta: conv.data?.running ? 'Working…' : 'Convert', act: async () => { if (conv.data?.running) return; if (!(conv.data?.outdated ?? 0)) { ctx.toast('Nothing to convert'); return; } if (!window.confirm(`Convert ${conv.data!.outdated.toLocaleString()} preview${conv.data!.outdated === 1 ? '' : 's'} across all members now?\n\nThis runs in the background and can take a while on a large library.`)) return; await act(ctx, () => api('/admin/convert-all', { body: {} }), 'Converting previews in the background'); conv.reload(); } },
      ] },
      { title: 'Per-person limit', rows: [
        { id: 'userQuota', t: 'text', label: 'Storage per person', hint: 'Type a size such as 2 GB, 500 MB or 1 TB. Leave it empty for no limit. Uploads pause for that member at the limit. Administrators aren’t limited.', value: showSize((inst.data as unknown as { userQuotaGb?: number })?.userQuotaGb ?? 0), ph: 'No limit', set: (v: string) => { const gb = parseSize(v); if (gb === null) { ctx.toast('Type a size like 2 GB or 500 MB, or leave it empty for no limit'); return; } void put({ userQuotaGb: gb }); } },
      ] },
      { title: 'Cloud providers', rows: mRows },
      { title: 'Cloud sign-in details', rows: [...details, { id: 'cpRedirect', t: 'link', label: 'Redirect URL', hint: `${cl.data?.redirectUri ?? ''} · paste this into each provider’s app settings`, meta: 'Copy', act: () => { void navigator.clipboard?.writeText(cl.data?.redirectUri ?? ''); ctx.toast('Copied the redirect URL'); } }] },
      { title: 'Cloud rules', rows: [
        { id: 'cpWho', t: 'select', label: 'Who can connect cloud storage', opts: WHO.map((w) => w[0]), value: WHO.find((w) => w[1] === inst.data?.cloudWho)?.[0] ?? 'Admins and members', set: (v) => void put({ cloudWho: WHO.find((w) => w[0] === v)![1] }) },
        { id: 'cpMinSync', t: 'select', label: 'Fastest sync allowed', hint: 'Members can’t check more often than this.', opts: SYNC.map((s) => s[0]), value: SYNC.find((s) => s[1] === inst.data?.cloudMinSyncMin)?.[0] ?? 'Every 15 min', set: (v) => void put({ cloudMinSyncMin: SYNC.find((s) => s[0] === v)![1] }) },
        { id: 'cpQuota', t: 'select', label: 'Storage per person from the cloud', opts: QUOTA.map((q) => q[0]), value: QUOTA.find((q) => q[1] === inst.data?.cloudQuotaGb)?.[0] ?? 'No limit', set: (v) => void put({ cloudQuotaGb: QUOTA.find((q) => q[0] === v)![1] }) },
        { id: 'cpRO', t: 'link', label: 'Read-only', hint: 'Frames only copies from cloud storage. It never deletes, moves or changes files there.', meta: '' },
      ] },
    ],
  };
}

/* ------------------------------------------------------------ Backup */
const EVERY: [string, number][] = [['Day', 1], ['Week', 7], ['Month', 30]];
export function useBackup(ctx: Ctx): Section {
  const inst = useApi<Inst>('/admin/instance');
  const list = useApi<{ archives: { name: string; bytes: number; at: string }[] }>('/admin/restore');
  const s3 = useApi<{ configured: boolean }>('/admin/backup/s3');
  const cloud = useApi<{ connected: boolean; provider: string }>('/admin/backup/cloud');
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); };
  const to = s3.data?.configured ? 'S3 bucket' : cloud.data?.connected ? 'Google Drive' : 'This server';
  const dest = to === 'This server' ? 'This server' : to;
  const configure = async () => { const { Restore, S3Backup, CloudBackup } = await import('../pages/ServerSettings'); ctx.modal(<Modal title="Off-server copies and restore" sub="Copy backups to S3 or a cloud account, or restore from a file." width={760} onClose={() => { ctx.modal(null); s3.reload(); cloud.reload(); list.reload(); }}><S3Backup /><CloudBackup /><Restore /></Modal>); };
  const restore = async (name: string) => { if (!window.confirm(`Restore from ${name}? It is checked first and applied the next time Frames starts. Everyone is signed out.`)) return; await act(ctx, () => api('/admin/restore', { body: { name } }), 'Checked · applied the next time Frames starts'); list.reload(); };
  const when = (iso: string) => { const d = new Date(iso); const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toDateString() === new Date(Date.now() - 86_400_000).toDateString() ? 'Yesterday' : fmtDate(iso, { day: 'numeric', month: 'short' }); return `${day}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`; };
  return {
    key: 'backup', name: 'Backup', hint: 'Ratings, tags and compositions. Not the photos.',
    action: { label: 'Back up now', act: async () => { await act(ctx, () => api('/admin/backup/now', { body: {} }), 'Backup started'); list.reload(); } },
    groups: [
      { rows: [
        { id: 'backupOn', t: 'toggle', label: 'Back up automatically', value: inst.data?.backupAuto !== false, set: (v) => void put({ backupAuto: v }) },
        { id: 'backupEvery', t: 'select', label: 'Every', dep: 'backupOn', opts: EVERY.map((e) => e[0]), value: EVERY.find((e) => e[1] === inst.data?.backupEveryDays)?.[0] ?? 'Day', set: (v) => void put({ backupEveryDays: EVERY.find((e) => e[0] === v)![1] }) },
        { id: 'backupKeep', t: 'stepper', label: 'Keep the last', dep: 'backupOn', value: inst.data?.backupKeep ?? 14, min: 1, max: 90, set: (v) => void put({ backupKeep: v }) },
        { id: 'backupTo', t: 'select', label: 'Save to', dep: 'backupOn', opts: ['This server', 'Google Drive', 'S3 bucket'], value: to, set: () => void configure() },
      ] },
      { title: 'History', rows: [
        ...(list.data?.archives ?? []).slice(0, 14).map((a): R => ({ id: `b-${a.name}`, t: 'button', label: when(a.at), hint: `${(a.bytes / 1e6).toFixed(1)} MB · ${dest}`, meta: 'Restore…', act: () => void restore(a.name) })),
        ...(list.data?.archives.length === 0 ? [{ id: 'b0', t: 'link', label: 'Nothing yet', hint: 'The first is made shortly after start-up, or press Back up now.', meta: '' } as R] : []),
        { id: 'bDl', t: 'button', label: 'Download a backup', hint: 'One archive of everyone’s libraries, made now.', meta: 'Download', act: () => { window.location.href = '/api/admin/backup'; } },
        { id: 'bMore', t: 'button', label: 'Off-server copies and restore from a file', meta: 'Open…', act: () => void configure() },
      ] },
    ],
  };
}

export { AddAi };
