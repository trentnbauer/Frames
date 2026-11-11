import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, useApi } from '../api';
import { Modal } from '../components/Modal';
import { AiSettings } from '../pages/AiSettings';
import { TokenSheet } from '../pages/TunnelSettings';
import { fmtDate } from '../data';
import { usePrefs } from './hooks';
import { AddAi } from './lib2';
import type { Ctx } from './sections';
import type { R, Section } from './ui';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'That did not work.');
const close = (ctx: Ctx) => () => ctx.modal(null);
const act = async (ctx: Ctx, fn: () => Promise<unknown>, ok = 'Saved') => { try { await fn(); ctx.toast(ok); } catch (e) { ctx.toast(msg(e)); } };
const gb = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : n >= 1e9 ? `${Math.round(n / 1e9)} GB` : n >= 1e6 ? `${Math.max(1, Math.round(n / 1e6))} MB` : `${Math.round(n / 1e3)} KB`);
type Inst = Record<string, any>;
const mono = "'IBM Plex Mono',monospace";
const eyebrow = { font: `500 10.5px ${mono}`, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' } as const;

/* ------------------------------------------------------------ Shared AI */
type Src = { id: string; type: string; name: string; model: string; endpoint: string };
const WHO: [string, boolean][] = [['Admins and members', true], ['Admins only', false]];
const CAP: [string, number][] = [['No limit', 0], ['100 requests', 100], ['500 requests', 500], ['2,000 requests', 2000], ['10,000 requests', 10000]];
export function useSrvAi(ctx: Ctx): Section {
  const d = useApi<{ sources: Src[] }>('/admin/ai/sources');
  const inst = useApi<Inst>('/admin/instance');
  const prefs = usePrefs('server');
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); };
  const manage = () => ctx.modal(<Modal title="Shared AI" sub="Address, model, key, test and removal." width={680} onClose={() => { ctx.modal(null); d.reload(); }}><AiSettings server /></Modal>);
  return {
    key: 'srvai', name: 'AI', hint: 'AI providers everyone on this server can use.',
    action: { label: '+ Add shared AI', act: () => ctx.modal(<AddAi ctx={ctx} shared reload={d.reload} />) },
    groups: [
      { title: 'Shared with everyone', rows: (d.data?.sources ?? []).length ? d.data!.sources.map((s): R => ({ id: `s-${s.id}`, t: 'link', icon: (s.name || s.type).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(), label: s.name || s.type, hint: `${s.model || 'no model yet'}${s.endpoint ? ` on ${s.endpoint.replace(/^https?:\/\//, '')}` : ''}`, meta: 'Manage', act: manage })) : [{ id: 'none', t: 'link', label: 'Nothing shared yet', hint: 'Add one and it appears in everyone’s list, ready to use.', meta: '' }] },
      { title: 'Rules', rows: [
        { id: 'sAiWho', t: 'select', label: 'Who can use shared AI', opts: WHO.map((w) => w[0]), value: prefs.get('sAiWho', 'Admins and members'), set: (v) => { prefs.set('sAiWho', v); ctx.toast('Saved'); } },
        { id: 'sAiOwn', t: 'toggle', label: 'Members can add their own AI', hint: 'Their keys, their bill. Shown only to them.', value: inst.data?.aiMembersOwn !== false, set: (v) => void put({ aiMembersOwn: v }) },
        { id: 'sAiCap', t: 'select', label: 'Monthly limit per person', hint: 'For shared paid providers. Free local AI isn’t limited.', opts: CAP.map((c) => c[0]), value: CAP.find((c) => c[1] === inst.data?.aiMonthlyLimit)?.[0] ?? 'No limit', set: (v) => void put({ aiMonthlyLimit: CAP.find((c) => c[0] === v)![1] }) },
        { id: 'sAiFirst', t: 'toggle', label: 'Put shared AI first for new members', hint: 'Sets the starting order for their jobs. They can change it.', value: !!inst.data?.aiSharedFirst, set: (v) => void put({ aiSharedFirst: v }) },
      ] },
    ],
  };
}

/* ------------------------------------------------------------ Tunnel */
type T = {
  config: { enabled: boolean; portfolios: boolean }; appUrl: string; hostnames: { hostname: string; kind: string; who: string }[]; service: string; allow: string[]; protect: boolean; protectForced: boolean; accessPeople: number; accountId: string; tunnelName: string; hasApiToken: boolean; error: string | null; appliedAt: string | null;
  status: { state: string; error: string | null }; accessApps: { name: string; decision: 'allow' | 'bypass'; addresses: string[]; who: string[] }[];
};
export function useNetwork(ctx: Ctx): Section {
  const d = useApi<T>('/tunnel');
  const logs = useApi<{ lines: string[] }>('/tunnel/logs');
  const t = d.data;
  useEffect(() => { const i = setInterval(() => d.reload(), 5000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (body: object) => { await act(ctx, () => api('/tunnel', { method: 'PUT', body })); d.reload(); };
  const state = t?.status.state ?? 'stopped';
  const hint = state === 'connected' ? 'Connected — Frames can be reached through Cloudflare.' : state === 'error' ? `Problem: ${t?.status.error ?? ''}` : state === 'starting' ? 'Connecting…' : 'Stopped';
  const help = () => ctx.modal(<Modal title="Account ID and API token" width={620} onClose={close(ctx)}><div style={{ fontSize: 13.5, color: '#a8a59f', lineHeight: 1.6, marginTop: 10 }}><ol style={{ margin: 0, paddingLeft: 20 }}><li><a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" style={{ color: '#efede8', textDecoration: 'underline' }}>Create an API token</a> (Custom token) with the permissions below, then copy it.</li><li>Your <b style={{ color: '#efede8', fontWeight: 500 }}>account ID</b> is on the right of the dashboard’s home page for your domain, and in its address after <span style={{ fontFamily: mono }}>dash.cloudflare.com/</span>.</li></ol><TokenSheet /></div></Modal>);
  const status = () => ctx.modal(
    <Modal title="What Frames set up in Cloudflare" sub={t?.error ?? (t?.appliedAt ? `Matches your addresses · ${new Date(t.appliedAt).toLocaleString()}` : 'Not applied yet')} width={720} onClose={close(ctx)} foot={<><a href="https://one.dash.cloudflare.com/" target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13.5, color: '#a8a59f' }}>Open Cloudflare Zero Trust ↗</a><button className="btn primary" onClick={close(ctx)}>Done</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        <span style={eyebrow}>Addresses</span>
        {(t?.hostnames ?? []).map((h) => <div key={h.hostname} style={{ background: '#0d0d0d', borderRadius: 10, padding: '9px 14px' }}><div style={{ font: `400 13px ${mono}`, userSelect: 'all' }}>{h.hostname}</div><div style={{ fontSize: 12, color: '#8f8c86' }}>{h.kind === 'app' ? `→ ${t?.service ?? ''}` : `→ portfolio${h.who ? `: ${h.who}` : ''}`}</div></div>)}
        <span style={{ ...eyebrow, marginTop: 8 }}>Access applications</span>
        {(t?.accessApps ?? []).map((a) => <div key={a.name} style={{ background: '#0d0d0d', borderRadius: 10, padding: '9px 14px' }}><div style={{ fontSize: 13 }}>{a.name} <span style={{ color: '#8f8c86' }}>· {a.decision === 'allow' ? 'login required' : 'public, no login'}</span></div><div style={{ font: `400 12px ${mono}`, color: '#8f8c86', wordBreak: 'break-all' }}>{a.addresses.join('  ')}</div></div>)}
      </div>
    </Modal>);
  const log = () => { logs.reload(); ctx.modal(<Modal title="Tunnel log" sub="What cloudflared reported, newest last." width={760} onClose={close(ctx)} foot={<><span className="grow" /><button className="btn primary" onClick={close(ctx)}>Close</button></>}><TunnelLog /></Modal>); };
  const sets = t?.hostnames ?? [];
  return {
    key: 'network', name: 'Cloudflare tunnel', hint: 'Reach Frames from outside your network without opening ports.',
    groups: [
      { rows: [{ id: 'tunnel', t: 'toggle', label: 'Run the tunnel', hint, value: !!t?.config.enabled, set: async (v: boolean) => { await act(ctx, () => api(v ? '/tunnel/start' : '/tunnel/stop', { body: {} })); d.reload(); } }] },
      { title: '1 · Let Frames use your Cloudflare account', rows: [
        { id: 'cfIntro', t: 'link', label: 'Frames makes the tunnel, its routes and the DNS records itself', hint: 'And keeps them right when an address changes. It needs your account ID and an API token.', meta: 'How to get them ↗', act: help },
        { id: 'cfAccount', t: 'text', label: 'Account ID', hint: 'On the right of the Cloudflare dashboard home page, and in its address after dash.cloudflare.com/.', value: t?.accountId ?? '', ph: '32 letters and numbers', set: (v) => void save({ accountId: v }) },
        { id: 'cfName', t: 'text', label: 'Tunnel name', hint: 'The name of the tunnel Frames makes in your Cloudflare account. Changing it makes a new tunnel; the old one stays in your account until you delete it there. Up to 60 letters, numbers, spaces, dots, dashes or underscores.', value: t?.tunnelName ?? 'Frames', ph: 'Frames', set: (v) => { if (v.trim()) void save({ tunnelName: v }); } },
        { id: 'cfApiToken', t: 'text', label: 'API token', hint: 'Kept on this server only, never shown again, and left out of backups.', value: '', ph: t?.hasApiToken ? 'Saved. Type to replace' : 'Paste the API token', inputType: 'password', set: (v) => { if (v) void save({ apiToken: v }); } },
        { id: 'cfApplied', t: 'link', label: t?.error ? 'Cloudflare is not set up' : t?.appliedAt ? 'Cloudflare is set up' : 'Not set up yet', hint: t?.error ?? (t?.appliedAt ? `Matches the addresses below · ${fmtDate(t.appliedAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Save the account ID and token and Frames sets it up.'), meta: 'Details', act: status },
      ] },
      { title: '2 · Addresses', rows: [
        { id: 'appUrl', t: 'text', label: 'App URL', hint: 'The address you open Frames at from outside. Same as the public address under Sign-in & access.', value: t?.appUrl ?? '', ph: 'https://frames.example.com', set: async (v: string) => { await act(ctx, () => api('/auth/config', { method: 'PUT', body: { publicUrl: v } })); d.reload(); } },
        { id: 'tunnelPf', t: 'toggle', label: 'Portfolios', hint: 'Also serve each person’s portfolio through this tunnel. A portfolio address shows only that person’s public portfolio.', value: !!t?.config.portfolios, set: (v) => void save({ portfolios: v }) },
        { id: 'cfWho', t: 'seg', label: 'Who can reach the App URL', hint: 'Members: Cloudflare Access only lets in people on your Members list, before Frames even loads. Anyone: Cloudflare lets everyone through; Frames’ own sign-in still applies. Either way, share links and portfolios stay public.', opts: ['Members', 'Anyone'], value: t?.protect ? 'Members' : 'Anyone', set: (v: string) => { if (t?.protectForced && v === 'Anyone') { ctx.toast('Only the allowed list can sign in, so this stays on Members'); return; } void save({ protect: v === 'Members' }); } },
        { id: 'cfMembers', t: 'link', dep: 'cfWho', depVal: 'Members', label: 'Members', hint: t?.allow.length ? t.allow.join(', ') : 'Nobody on the allowed list yet.', meta: 'Open Members →', act: () => ctx.goto('srv', 'people') },
      ] },
      { title: '3 · What Frames sets up', rows: sets.length ? sets.map((h, i): R => ({ id: `cfHost${i}`, t: 'link', label: h.hostname, hint: h.kind === 'app' ? `Access: login, allow your Members; share links and portfolio public  →  ${(t?.service ?? '').replace(/^https?:\/\//, '')}` : `Access: public, no login  →  portfolio${h.who ? `: ${h.who}` : ''} (only the public portfolio)`, meta: '' })) : [{ id: 'cfNone', t: 'link', label: 'Nothing yet', hint: 'Enter the App URL to see the addresses.', meta: '' }] },
      { title: 'Cloudflare Access policies', rows: [
        ...(t?.accessApps ?? []).map((a, i): R => ({ id: `cfApp${i}`, t: 'link', label: a.name, hint: `${a.addresses.join('  ')}  ·  Policy: ${a.decision === 'allow' ? `allow ${a.who.length ? a.who.join(', ') : 'no one'}` : 'bypass (everyone), so share links and portfolios work without a login'}`, meta: '' })),
        { id: 'tunnelLog', t: 'button', label: 'Tunnel log', hint: 'What cloudflared reported, newest last.', meta: 'Show', act: log },
      ] },
    ],
  };
}

type LogLine = { time: string; level: string; message: string };
/** The server's own log: the newest lines, colour-coded (WRN amber, ERR red), with the whole file as a download. */
function LogModal({ ctx }: { ctx: Ctx }) {
  const l = useApi<{ lines: LogLine[]; bytes: number; level: string }>('/admin/logs/tail?tail=300');
  const lines = l.data?.lines ?? [];
  const bytes = l.data?.bytes ?? 0;
  const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const tag = (x: string) => (x === 'WARN' ? 'WRN' : x === 'ERROR' ? 'ERR' : x === 'DEBUG' ? 'DBG' : 'INF');
  const colour = (x: string) => (x === 'WARN' ? 'oklch(0.8 0.13 80)' : x === 'ERROR' ? '#e79a82' : '#a8a59f');
  const text = lines.map((x) => `${x.time} ${tag(x.level)} ${x.message}`).join('\n');
  return (
    <Modal title="Logs" sub={`Log level: ${cap1(l.data?.level ?? 'info')} · the newest lines, last 7 days`} width={820} onClose={close(ctx)}
      foot={<><span className="grow" /><a className="btn outline" href="/api/admin/logs/download" download>Download all · {size}</a><button className="btn" onClick={() => { void navigator.clipboard?.writeText(text).then(() => ctx.toast('Copied')); }}>Copy</button><button className="btn primary" onClick={close(ctx)}>Close</button></>}>
      <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '12px 14px', maxHeight: 380, overflow: 'auto', font: `400 11.5px/1.6 ${mono}`, whiteSpace: 'pre-wrap', marginTop: 12 }}>
        {l.loading && <span style={{ color: '#8f8c86' }}>Loading…</span>}
        {!l.loading && lines.length === 0 && <span style={{ color: '#8f8c86' }}>Nothing logged yet.</span>}
        {lines.map((x, i) => <div key={i} style={{ color: colour(x.level) }}><span style={{ color: '#6f6c67' }}>{x.time.slice(11, 19)}</span> {tag(x.level)} {x.message}</div>)}
      </div>
    </Modal>
  );
}
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
function TunnelLog() {
  const l = useApi<{ lines: string[] }>('/tunnel/logs');
  return <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '12px 14px', maxHeight: 340, overflow: 'auto', font: `400 11.5px/1.6 ${mono}`, color: '#a8a59f', whiteSpace: 'pre-wrap', marginTop: 12 }}>{l.data?.lines.length ? l.data.lines.join('\n') : 'Nothing logged yet.'}</div>;
}

/* ------------------------------------------------------------ Email */
type Em = { smtp: { host: string; port: number; secure: boolean; user: string; from: string; fromName: string; enabled: boolean }; hasPassword: boolean; configured: boolean; health: { ok: boolean } | null; emailSignIn: boolean };
type Log = { id: number; at: string; to: string; subject: string; type: string; status: 'delivered' | 'failed'; error: string };
const PORTS: [string, number][] = [['465 · SSL', 465], ['587 · STARTTLS', 587], ['25', 25]];
function MailLog({ ctx }: { ctx: Ctx }) {
  const [f, setF] = useState<'all' | 'delivered' | 'failed'>('all');
  const l = useApi<{ rows: Log[] }>(`/admin/email/log${f === 'all' ? '' : `?status=${f}`}`);
  const rows = l.data?.rows ?? [];
  const failed = rows.filter((r) => r.status === 'failed').length;
  return (
    <Modal title="Email log" sub={`Last 30 days · ${rows.length - failed} sent · ${failed} failed`} width={800} onClose={close(ctx)}
      foot={<><span role="button" tabIndex={0} style={{ flex: 1, fontSize: 13.5, color: '#a8a59f', cursor: 'pointer', opacity: failed ? 1 : 0.4 }} onClick={async () => { if (failed) { const r = await api<{ sent: number }>('/admin/email/log/retry', { body: {} }); ctx.toast(`${r.sent} resent`); l.reload(); } }}>Retry failed</span><a className="btn outline" href="/api/admin/email/log.csv" download>Download CSV</a><button className="btn primary" onClick={close(ctx)}>Close</button></>}>
      <div className="seg" role="tablist" style={{ alignSelf: 'flex-start', margin: '12px 0' }}>{(['all', 'delivered', 'failed'] as const).map((k) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} style={{ textTransform: 'capitalize' }}>{k}</button>)}</div>
      <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '2px 14px', maxHeight: 380, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) minmax(0,1.4fr) 90px 100px', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.08)', ...eyebrow }}><span>When</span><span>To</span><span>Subject</span><span>Type</span><span style={{ textAlign: 'right' }}>Status</span></div>
        {rows.slice(0, 80).map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) minmax(0,1.4fr) 90px 100px', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 13 }}>
            <span style={{ color: '#8f8c86', fontSize: 12.5 }}>{fmtDate(r.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.to}</span>
            <span title={r.error} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#a8a59f' }}>{r.subject}</span><span style={{ fontSize: 12, color: '#8f8c86' }}>{r.type}</span>
            <span style={{ textAlign: 'right', fontSize: 12.5, color: r.status === 'failed' ? 'oklch(0.75 0.14 28)' : 'oklch(0.78 0.12 150)' }}>{r.status === 'failed' ? 'Failed' : 'Delivered'}</span>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: '24px 0', color: '#8f8c86', textAlign: 'center' }}>Nothing here.</div>}
      </div>
      <div style={{ fontSize: 12.5, color: '#8f8c86', marginTop: 12 }}>Kept for 30 days. Email bodies aren’t stored — only who, what and whether it was delivered.</div>
    </Modal>
  );
}
export function useEmail(ctx: Ctx): Section {
  const e = useApi<Em>('/admin/email');
  const log = useApi<{ rows: Log[] }>('/admin/email/log');
  const d = e.data;
  const put = async (body: object, ok = 'Saved') => { await act(ctx, () => api('/admin/email', { method: 'PUT', body }), ok); e.reload(); };
  const failed = (log.data?.rows ?? []).filter((r) => r.status === 'failed').length;
  const on = !!d?.smtp.enabled;
  const from = d ? (d.smtp.fromName && d.smtp.from ? `${d.smtp.fromName} <${d.smtp.from}>` : d.smtp.from) : '';
  const parseFrom = (v: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v); return m ? { fromName: m[1].trim() || 'Frames', from: m[2].trim() } : { from: v.trim() }; };
  return {
    key: 'email', name: 'Email', hint: 'For invites, guest replies and password-free sign-in.',
    groups: [
      { rows: [
        { id: 'mailOn', t: 'toggle', label: 'Send email', hint: 'Off: invites and shares are copy-a-link only.', value: on, set: (v) => void put({ enabled: v }) },
        { id: 'smtpHost', t: 'text', label: 'SMTP server', dep: 'mailOn', value: d?.smtp.host ?? '', ph: 'smtp.example.com', set: (v) => void put({ host: v }, 'Saved · connection checked') },
        { id: 'smtpPort', t: 'select', label: 'Port', dep: 'mailOn', opts: PORTS.map((p) => p[0]), value: PORTS.find((p) => p[1] === d?.smtp.port)?.[0] ?? `${d?.smtp.port ?? 587}`, set: (v) => { const n = PORTS.find((p) => p[0] === v)![1]; void put({ port: n, secure: n === 465 }); } },
        { id: 'smtpUser', t: 'text', label: 'Username', dep: 'mailOn', value: d?.smtp.user ?? '', set: (v) => void put({ user: v }) },
        { id: 'smtpPass', t: 'text', label: 'Password', dep: 'mailOn', inputType: 'password', value: '', ph: d?.hasPassword ? 'Saved. Type to replace' : '', set: (v) => { if (v) void put({ password: v }, 'Saved · connection checked'); } },
        { id: 'mailFrom', t: 'text', label: 'Send as', dep: 'mailOn', value: from, ph: 'Frames <frames@example.com>', set: (v) => void put(parseFrom(v)) },
        { id: 'mailTest', t: 'button', label: 'Send a test email', dep: 'mailOn', hint: `To ${ctx.me?.user?.email ?? 'you'}`, meta: 'Send', act: async () => { await act(ctx, () => api('/admin/email/test', { body: {} }), `Test email sent to ${ctx.me?.user?.email ?? 'you'} · see the Email log`); log.reload(); } },
        { id: 'mailCode', t: 'toggle', label: 'Let people sign in with a code', dep: 'mailOn', hint: d?.health?.ok ? 'Offered on the sign-in page while the connection check passes.' : 'Needs a passing connection check first.', value: !!d?.emailSignIn, togDisabled: d?.health?.ok ? undefined : 'Needs a passing check first', set: async (v: boolean) => { await act(ctx, () => api('/auth/config', { method: 'PUT', body: { email: v } })); e.reload(); } },
      ] },
      { title: 'Sent', rows: [{ id: 'mailLog', t: 'button', label: 'Email log', hint: `Last 30 days · ${(log.data?.rows.length ?? 0) - failed} sent · ${failed} failed`, meta: 'View', act: () => ctx.modal(<MailLog ctx={ctx} />) }] },
    ],
  };
}

/* ------------------------------------------------- Storage & processing */
const LIMIT: [string, number][] = [['10 GB', 10], ['25 GB', 25], ['50 GB', 50], ['100 GB', 100], ['No limit', 0]];
const PREVIEW: [string, number][] = [['1600 px', 1600], ['2400 px', 2400], ['3072 px', 3072], ['4096 px', 4096]];
const HEAVY: [string, string][] = [['Any time', 'always'], ['Overnight only (1–6 am)', 'overnight'], ['When idle', 'idle']];
export function useProcessing(ctx: Ctx): Section {
  const inst = useApi<Inst>('/admin/instance');
  const sys = useApi<{ cache: { path: string; bytes: number }; cpus?: number }>('/admin/system');
  const q = useApi<{ thumbnails: number; ai: number; running: boolean }>('/library/queue');
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); sys.reload(); };
  const limit = (inst.data?.cacheLimitGb ?? 0) * 1073741824;
  const c = sys.data?.cache;
  const run = async (path: string, ok: string) => { await act(ctx, () => api(path, { body: {} }), ok); q.reload(); };
  const workers = inst.data?.workers || Math.min(sys.data?.cpus ?? 4, 8);
  return {
    key: 'processing', name: 'Storage & processing', hint: 'Thumbnails, previews and background work.',
    groups: [
      { title: 'Cache', rows: [
        { id: 'cachePath', t: 'text', label: 'Cache folder', hint: 'Thumbnails and previews. Safe to delete; they rebuild.', value: c?.path ?? '', disabled: true },
        { id: 'cacheUse', t: 'meter', label: 'Cache size', hint: c?.path, pct: limit && c ? (c.bytes / limit) * 100 : 0, text: c ? (limit ? `${gb(c.bytes)} of ${gb(limit)} limit` : gb(c.bytes)) : '' },
        { id: 'cacheMax', t: 'select', label: 'Cache limit', opts: LIMIT.map((l) => l[0]), value: LIMIT.find((l) => l[1] === inst.data?.cacheLimitGb)?.[0] ?? 'No limit', set: (v) => void put({ cacheLimitGb: LIMIT.find((l) => l[0] === v)![1] }) },
      ] },
      { title: 'Processing', rows: [
        { id: 'rawMode', t: 'seg', label: 'RAW previews', hint: 'Embedded is instant; full decode looks better but is slower.', opts: ['Embedded JPEG', 'Full decode'], value: inst.data?.rawPreview === 'full' ? 'Full decode' : 'Embedded JPEG', set: (v: string) => void put({ rawPreview: v === 'Full decode' ? 'full' : 'embedded' }) },
        { id: 'workers', t: 'stepper', label: 'Background workers', hint: 'More is faster, but uses more CPU while you work.', value: workers, min: 1, max: 8, set: (v) => void put({ workers: v }) },
        { id: 'quietHours', t: 'select', label: 'Heavy jobs run', hint: 'Re-indexing, AI tagging and full RAW decodes.', opts: HEAVY.map((h) => h[0]), value: HEAVY.find((h) => h[1] === inst.data?.heavyJobs)?.[0] ?? 'Any time', set: (v) => void put({ heavyJobs: HEAVY.find((h) => h[0] === v)![1] }) },
      ] },
      { title: 'Jobs', rows: [
        { id: 'jobQueue', t: 'link', label: 'Queue', hint: `${q.data?.thumbnails ?? 0} thumbnails · ${q.data?.ai ?? 0} AI descriptions · ${q.data?.running ? 'running' : 'idle'}`, meta: 'View', act: () => { q.reload(); ctx.modal(<Modal title="Job queue" sub="Work waiting in the background." width={520} onClose={close(ctx)} foot={<><span className="grow" /><button className="btn primary" onClick={close(ctx)}>Close</button></>}><QueueBody /></Modal>); } },
        { id: 'rescan', t: 'button', label: 'Rescan library folder', hint: 'Finds new, moved and deleted files.', meta: 'Rescan', act: () => void run('/library/scan', 'Rescan started') },
        { id: 'rethumbs', t: 'button', label: 'Rebuild thumbnails', meta: 'Rebuild', act: () => void run('/library/rebuild?all=1', 'Rebuilding thumbnails in the background') },
        { id: 'reindex', t: 'button', label: 'Re-index search', hint: 'Re-reads metadata and AI descriptions.', meta: 'Re-index', act: () => void run('/library/reindex', 'Re-indexing search in the background') },
      ] },
    ],
  };
}
function QueueBody() {
  const q = useApi<{ thumbnails: number; ai: number; running: boolean }>('/library/queue');
  const row = (a: string, b: string | number) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}><span>{a}</span><span style={{ color: '#a8a59f' }}>{b}</span></div>;
  return <div style={{ marginTop: 10 }}>{row('Thumbnails to make', q.data?.thumbnails ?? '…')}{row('Photos for the AI to describe', q.data?.ai ?? '…')}{row('Working now', q.data?.running ? 'Yes' : 'No')}</div>;
}

/* ------------------------------------------------- Updates & system */
const LEVELS: [string, string][] = [['Errors', 'errors'], ['Warnings', 'warnings'], ['Info', 'info'], ['Debug', 'debug']];
type Cmp = { rows: { name: string; secret: boolean; status: 'same' | 'differs' | 'app only' | 'env only'; env?: string; app?: string }[]; counts: { same: number; differs: number; appOnly: number; envOnly: number } };
function Diff({ ctx, secrets }: { ctx: Ctx; secrets: boolean }) {
  const c = useApi<Cmp>('/admin/env/compare');
  const rows = (c.data?.rows ?? []).filter((r) => r.status !== 'same');
  const restart = async () => { if (!window.confirm('Restart Frames now so it loads the file’s values?')) return; await act(ctx, () => api('/admin/restart', { method: 'POST' }), 'Restarting…'); };
  return (
    <Modal title={rows.length ? `${rows.length} ${rows.length === 1 ? 'setting differs' : 'settings differ'}` : 'The app and the file agree'} sub="Frames is using the app’s values. A restart would load the file’s values instead." width={720} onClose={close(ctx)}
      foot={<><span role="button" tabIndex={0} style={{ flex: 1, fontSize: 13.5, color: '#a8a59f', cursor: 'pointer' }} onClick={() => ctx.toast('The file is /config/frames.env on the server')}>Open the file</span><button className="btn outline" onClick={() => void restart()}>Use the file’s values</button><a className="btn primary" href={`/api/admin/env/export${secrets ? '?secrets=1' : ''}`} download>Export app values to .env</a></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', borderRadius: 10, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)', fontSize: 13, marginTop: 12, maxHeight: 380, overflowY: 'auto' }}>
        {['Setting', 'In the app', 'In frames.env'].map((h) => <span key={h} style={{ padding: '10px 14px', background: '#161615', ...eyebrow }}>{h}</span>)}
        {rows.map((r) => (
          <div key={r.name} style={{ display: 'contents' }}>
            <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', font: `400 11.5px ${mono}`, color: '#a8a59f', wordBreak: 'break-all' }}>{r.name}</div>
            <span style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', font: `400 12.5px ${mono}`, color: 'oklch(0.8 0.12 150)', wordBreak: 'break-all' }}>{r.secret ? (r.status === 'env only' ? '–' : '•••• set') : r.status === 'env only' ? '–' : (r.app ?? r.env ?? '')}</span>
            <span style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', font: `400 12.5px ${mono}`, color: 'oklch(0.78 0.12 28)', wordBreak: 'break-all' }}>{r.secret ? (r.status === 'app only' ? '–' : '•••• set') : r.status === 'app only' ? 'not set' : (r.env ?? '')}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
function Import({ ctx }: { ctx: Ctx }) {
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [r, setR] = useState<{ rows: { name: string; secret: boolean; status: string }[]; counts: { new: number; changes: number; same: number }; problems: string[] } | null>(null);
  const [err, setErr] = useState('');
  const look = async (t: string) => { setText(t); setErr(''); try { setR(await api('/admin/env/import', { body: { text: t } })); } catch (e) { setErr(msg(e)); } };
  const apply = async () => { try { const x = await api<{ applied: number }>('/admin/env/import', { body: { text, apply: true } }); ctx.toast(`Applied ${x.applied} settings`); ctx.modal(null); } catch (e) { setErr(msg(e)); } };
  const changing = (r?.rows ?? []).filter((x) => x.status !== 'same');
  return (
    <Modal title="Import a .env file" sub="Shows what will change before applying." width={720} onClose={close(ctx)} foot={<><span className="grow" /><button className="btn outline" onClick={() => file.current?.click()}>Choose a file…</button><button className="btn primary" disabled={!r || changing.length === 0} onClick={() => void apply()}>Apply {changing.length || ''}</button></>}>
      <input ref={file} type="file" accept=".env,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await look(await f.text()); }} />
      {err && <div role="alert" style={{ color: 'oklch(0.75 0.14 28)', fontSize: 13, marginTop: 10 }}>{err}</div>}
      {!r && <p style={{ color: '#8f8c86', fontSize: 13.5 }}>Choose a frames.env file. Nothing changes until you press Apply.</p>}
      {r && <div style={{ marginTop: 12, fontSize: 13 }}><div style={{ color: '#a8a59f', marginBottom: 8 }}>{r.counts.new} new · {r.counts.changes} would change · {r.counts.same} the same{r.problems.length ? ` · ${r.problems.join(' ')}` : ''}</div>
        <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '2px 14px', maxHeight: 340, overflow: 'auto' }}>{changing.map((x) => <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)', font: `400 12px ${mono}` }}><span style={{ wordBreak: 'break-all' }}>{x.name}</span><span style={{ color: x.status === 'new' ? 'oklch(0.8 0.12 150)' : 'oklch(0.78 0.12 28)', flex: 'none', marginLeft: 12 }}>{x.status === 'new' ? 'new' : 'changes'}{x.secret ? ' · secret' : ''}</span></div>)}</div></div>}
    </Modal>
  );
}
export function useServer(ctx: Ctx): Section {
  const sys = useApi<{ version: string; image: string; checks: { name: string; ok: boolean }[] }>('/admin/system');
  const inst = useApi<Inst>('/admin/instance');
  const rel = useApi<{ releases: { name: string }[]; source: string }>('/releases');
  const logs = useApi<{ bytes: number }>('/admin/logs/info');
  const [secrets, setSecrets] = useState(false);
  const [checked, setChecked] = useState(false);
  // The "Settings out of sync" banner comes here to show the differences straight away.
  const loc = useLocation();
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('env') !== 'diff') return;
    u.searchParams.delete('env'); window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    ctx.modal(<Diff ctx={ctx} secrets={false} />);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = async (body: object) => { await act(ctx, () => api('/admin/instance', { method: 'PUT', body })); inst.reload(); rel.reload(); };
  const bad = (sys.data?.checks ?? []).filter((c) => !c.ok);
  const newer = rel.data?.releases[0];
  const size = logs.data ? (logs.data.bytes > 1048576 ? `${(logs.data.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(logs.data.bytes / 1024))} KB`) : '…';
  return {
    key: 'server', name: 'Updates & system', hint: 'Version, logs and maintenance.',
    groups: [
      { title: 'Updates', rows: [
        { id: 'version', t: 'button', label: 'Version', hint: `${sys.data ? (sys.data.version === 'dev' ? 'development build' : `v${sys.data.version.replace(/^v/, '')}`) : '…'} · ${sys.data?.image ?? ''}`, meta: 'Check now', act: async () => { rel.reload(); setChecked(true); ctx.toast(newer ? `${newer.name} is available · update by pulling a new image` : rel.data?.source === 'none' ? 'Could not reach GitHub' : 'You’re on the latest version · update by pulling a new image'); void checked; } },
        { id: 'channel', t: 'seg', label: 'Update channel', opts: ['Stable', 'Beta'], value: inst.data?.updateChannel === 'beta' ? 'Beta' : 'Stable', set: (v: string) => void put({ updateChannel: v.toLowerCase() }) },
        { id: 'updPopup', t: 'toggle', label: 'Show admins what’s new after an update', hint: 'From GitHub releases, once per version.', value: inst.data?.showWhatsNew !== false, set: (v) => void put({ showWhatsNew: v }) },
      ] },
      { title: 'Logs & health', rows: [
        { id: 'health', t: 'button', label: 'Health', hint: sys.data ? (bad.length ? `Needs attention: ${bad.map((c) => c.name).join(', ')}` : `All good · ${sys.data.checks.map((c) => c.name).join(', ')}`) : 'Checking…', meta: 'Run checks', act: () => { sys.reload(); ctx.toast(bad.length ? `${bad.length} need attention` : `All ${sys.data?.checks.length ?? 0} checks passed`); } },
        { id: 'logLevel', t: 'select', label: 'Log level', opts: LEVELS.map((l) => l[0]), value: LEVELS.find((l) => l[1] === inst.data?.logLevel)?.[0] ?? 'Info', set: (v) => void put({ logLevel: LEVELS.find((l) => l[0] === v)![1] }) },
        { id: 'logs', t: 'button', label: 'Logs', hint: `Last 7 days · ${size}`, meta: 'Show', act: () => ctx.modal(<LogModal ctx={ctx} />) },
      ] },
      { title: 'Advanced', rows: [
        { id: 'env', t: 'link', label: 'Environment file', hint: 'Compare the app’s settings with /config/frames.env.', meta: 'Show differences', act: () => ctx.modal(<Diff ctx={ctx} secrets={secrets} />) },
        { id: 'envExport', t: 'button', label: 'Export settings as .env', hint: 'Every server setting on these pages as environment variables, for docker-compose or a fresh install. Secrets are included only if you choose.', meta: 'Export', act: () => { window.location.href = `/api/admin/env/export${secrets ? '?secrets=1' : ''}`; ctx.toast(secrets ? 'Downloaded frames.env with secrets' : 'Downloaded frames.env · secrets left blank'); } },
        { id: 'envSecrets', t: 'toggle', label: 'Include secrets in the export', hint: 'API keys, tunnel token, SMTP password. Keep the file safe.', value: secrets, set: async (v: boolean) => {
          if (!v) { setSecrets(false); return; }
          try { await api('/admin/env/export-enabled', { method: 'PUT', body: { on: true } }); setSecrets(true); } catch (e) { const m = msg(e); if (/Sign in again/.test(m) && ctx.me?.user) window.location.assign(`/auth/login/${encodeURIComponent(ctx.me.user.provider)}?returnTo=${encodeURIComponent('/settings?tab=srv&section=server')}`); else ctx.toast(m); } } },
        { id: 'envImport', t: 'button', label: 'Import a .env file', hint: 'Shows what will change before applying.', meta: 'Import…', act: () => ctx.modal(<Import ctx={ctx} />) },
        { id: 'restart', t: 'button', label: 'Restart Frames', hint: 'Takes about 20 seconds. Signed-in people stay signed in.', meta: 'Restart', act: async () => { if (!window.confirm('Restart Frames now?')) return; await act(ctx, () => api('/admin/restart', { method: 'POST' }), 'Restarting…'); } },
      ] },
    ],
  };
}
