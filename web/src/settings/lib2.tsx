import { useEffect, useState } from 'react';
import { api, imgUrl, openPortfolio, useApi } from '../api';
import { Modal, Spinner } from '../components/Modal';
import { CloudSettings } from '../pages/CloudSettings';
import { AiSettings } from '../pages/AiSettings';
import { YourData } from '../pages/YourData';
import { Profile } from '../pages/Profile';
import { PortfolioSelection } from '../components/PortfolioSelection';
import { usePrefs } from './hooks';
import type { Ctx } from './sections';
import type { Section } from './ui';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'That did not work.');
const close = (ctx: Ctx) => () => ctx.modal(null);
const act = async (ctx: Ctx, fn: () => Promise<unknown>, ok = 'Saved') => { try { await fn(); ctx.toast(ok); } catch (e) { ctx.toast(msg(e)); } };

/* ---------------------------------------------------------------------- AI */
type Src = { id: string; type: string; name: string; model: string; shared?: boolean; ready: boolean; why: string };
type Type = { id: string; label: string; local: boolean; needsKey: boolean; endpoint: string; model: string };
type JobCfg = { on: boolean; order: string[]; skip: string[] };
const JOBS: [string, string, string][] = [['search', 'Search by description', 'Runs often, so a local model first keeps costs down.'], ['describe', 'Describe and tag photos', 'Titles, captions, alt text and tags for Analyze with AI.'], ['sensitive', 'Flag sensitive photos', 'Suggests nudity, violence or adult tags for you to confirm.'], ['ideas', 'Composition ideas on Home', 'Groups photos by tags and colour.']];
const BRANDS: [string, string, string, string, string, string][] = [['anthropic', 'CL', 'Claude', 'Anthropic · best at descriptions', 'key', 'claude-sonnet'], ['openai', 'OA', 'OpenAI', 'GPT models with vision', 'key', 'gpt-4.1-mini'], ['gemini', 'GE', 'Google Gemini', 'Cheap, fast, good at tags', 'key', 'gemini-2.5-flash'], ['ollama', 'OL', 'Local (Ollama)', 'Runs on your hardware · free', 'addr', 'llava'], ['openrouter', 'OR', 'OpenRouter', 'Many models, one key', 'key', 'openai/gpt-4o-mini'], ['custom', '+', 'Other', 'Any OpenAI-compatible address: LM Studio, OpenRouter…', 'both', '']];
const initials = (s: string) => s.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'AI';

/** The handover's "Add an AI provider" dialog: pick the provider, give it a key or an address, test it, connect. */
export function AddAi({ ctx, shared, reload }: { ctx: Ctx; shared: boolean; reload: () => void }) {
  const base = shared ? '/admin/ai' : '/ai';
  const [brand, setBrand] = useState<string | null>(null);
  const [f, setF] = useState({ key: '', addr: '', model: '', ack: false });
  const [test, setTest] = useState<{ ok: boolean; text: string } | 'busy' | null>(null);
  const [busy, setBusy] = useState(false);
  const b = BRANDS.find((x) => x[0] === brand);
  const needKey = !!b && (b[4] === 'key' || b[4] === 'both'), needAddr = !!b && (b[4] === 'addr' || b[4] === 'both');
  const ext = !!b && b[0] !== 'ollama';
  const ok = !!b && (!needKey || f.key.trim().length > 6) && (!needAddr || f.addr.trim().length > 4) && (!ext || f.ack);
  const create = async () => {
    const r = await api<{ sources: Src[] }>(`${base}/sources`, { body: { type: b![0], name: b![2] } });
    const id = r.sources[r.sources.length - 1].id;
    await api(`${base}/sources/${id}`, { method: 'PUT', body: { ...(f.addr ? { endpoint: f.addr.trim() } : {}), model: f.model.trim() || b![5], ...(f.key ? { key: f.key.trim() } : {}), ack: ext ? f.ack : undefined } });
    return id;
  };
  const connect = async () => { setBusy(true); try { await create(); ctx.toast(shared ? 'Shared AI added' : 'Connected'); ctx.modal(null); reload(); } catch (e) { setTest({ ok: false, text: msg(e) }); } setBusy(false); };
  const runTest = async () => {
    setTest('busy');
    try {
      const id = await create();
      const r = await api<{ ok: boolean; detail: string }>(`${base}/sources/${id}/test`, { body: {} });
      setTest({ ok: r.ok, text: r.detail });
      if (!r.ok) await api(`${base}/sources/${id}`, { method: 'DELETE' }).catch(() => undefined); // a failed test leaves nothing behind
      else { ctx.modal(null); ctx.toast('Connected'); reload(); }
    } catch (e) { setTest({ ok: false, text: msg(e) }); }
  };
  return (
    <Modal title={b ? `${shared ? 'Share' : 'Connect'} ${b[2]}` : shared ? 'Add shared AI' : 'Add an AI provider'} sub={b ? b[3] : shared ? 'Everyone on this server can use it. Paid usage counts toward the per-person limit.' : 'Pick the provider. Add as many as you like, then set the order each job uses them in.'} width={560} onClose={close(ctx)}
      foot={b ? <><button className="btn outline" onClick={() => { setBrand(null); setTest(null); }}>Back</button><span className="grow" /><button className="btn outline" disabled={!ok || test === 'busy'} onClick={() => void runTest()}>{test === 'busy' ? <Spinner /> : 'Test and connect'}</button><button className="btn primary" disabled={!ok || busy} onClick={() => void connect()}>{shared ? 'Share' : 'Connect'}</button></> : undefined}>
      {!b && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          {BRANDS.map(([k, icon, name, note]) => (
            <div key={k} role="button" tabIndex={0} onClick={() => { setBrand(k); setTest(null); }} onKeyDown={(e) => { if (e.key === 'Enter') setBrand(k); }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px var(--chip)' }}>
              <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', font: "500 12px 'IBM Plex Mono',monospace", background: 'var(--hair)' }}>{icon}</span>
              <span><div style={{ fontSize: 14.5 }}>{name}</div><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{note}</div></span>
            </div>
          ))}
        </div>
      )}
      {b && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {needAddr && <label className="fld">Address<input className="field-in" value={f.addr} placeholder={b[0] === 'ollama' ? 'http://192.168.1.20:11434' : 'https://openrouter.ai/api/v1'} onChange={(e) => { setF({ ...f, addr: e.target.value }); setTest(null); }} /></label>}
          {needKey && <label className="fld">Key<input className="field-in" type="password" autoComplete="off" value={f.key} placeholder="Paste your key" onChange={(e) => { setF({ ...f, key: e.target.value }); setTest(null); }} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>{shared ? 'Stored on this server, never shown again.' : 'Stored on this server, only you can use it, never shown again.'}</span></label>}
          <label className="fld">Model<input className="field-in" value={f.model} placeholder={b[5] || 'model name'} onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
          {ext && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' }}><input type="checkbox" checked={f.ack} onChange={(e) => setF({ ...f, ack: e.target.checked })} /><span>I understand previews (up to 1024 px) of photographs are sent to this provider, which may store or use them under its terms.</span></label>}
          {test && test !== 'busy' && <div role="status" style={{ fontSize: 13, color: test.ok ? 'var(--ok)' : 'var(--danger)' }}>{test.text}</div>}
        </div>
      )}
    </Modal>
  );
}

function OrderModal({ ctx, job, title, jobs, src, put }: { ctx: Ctx; job: string; title: string; jobs: Record<string, JobCfg>; src: Src[]; put: (job: string, body: object) => void }) {
  const cfg = jobs[job];
  const name = (id: string) => { const s = src.find((x) => x.id === id); return s ? s.name + (s.model ? ` · ${s.model}` : '') : id; };
  const move = (i: number, by: number) => { const o = [...cfg.order]; const k = i + by; if (k < 0 || k >= o.length) return; [o[i], o[k]] = [o[k], o[i]]; put(job, { order: o }); };
  const on = cfg.order.filter((i) => !cfg.skip.includes(i));
  return (
    <Modal title={`${title} · order`} sub="Top to bottom. The job uses #1; if it fails, the next takes over." width={520} onClose={close(ctx)} foot={<><span className="grow" /><button className="btn primary" onClick={close(ctx)}>Done</button></>}>
      <div style={{ marginTop: 10 }}>
        {cfg.order.map((id, i) => {
          const skipped = cfg.skip.includes(id);
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--hair)' : 0, opacity: skipped ? 0.5 : 1 }}>
              <b style={{ font: "500 11px 'IBM Plex Mono',monospace", width: 18, color: 'var(--muted)' }}>{skipped ? '–' : on.indexOf(id) + 1}</b>
              <span style={{ flex: 1, textDecoration: skipped ? 'line-through' : 'none' }}>{name(id)}</span>
              <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ color: i === 0 ? 'var(--disabled)' : 'var(--text2)' }}>▲</button>
              <button aria-label="Move down" disabled={i === cfg.order.length - 1} onClick={() => move(i, 1)} style={{ color: i === cfg.order.length - 1 ? 'var(--disabled)' : 'var(--text2)' }}>▼</button>
              <button className="btn outline" style={{ height: 30, fontSize: 12.5 }} onClick={() => { if (!skipped && on.length <= 1) { ctx.toast('Keep at least one provider, or switch the job off'); return; } put(job, { skip: skipped ? cfg.skip.filter((x) => x !== id) : [...cfg.skip, id] }); }}>{skipped ? 'Use' : 'Skip'}</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function useAi(ctx: Ctx): Section {
  const d = useApi<{ types: Type[]; sources: Src[] }>('/ai/sources');
  const j = useApi<{ jobs: Record<string, JobCfg> }>('/ai/jobs');
  const prefs = usePrefs('user');
  const sources = d.data?.sources ?? [];
  const nameOf = (id: string) => { const s = sources.find((x) => x.id === id); return s ? s.name : id; };
  const put = (job: string, body: object) => { void api(`/ai/jobs/${job}`, { method: 'PUT', body }).then(() => j.reload()).catch((e) => ctx.toast(msg(e))); };
  const manage = () => ctx.modal(<Modal title="AI providers" sub="Keys, models, addresses, tests and removal." width={680} onClose={() => { ctx.modal(null); d.reload(); j.reload(); }}><AiSettings /></Modal>);
  const openOrder = (job: string, title: string) => { if (j.data) ctx.modal(<OrderModal ctx={ctx} job={job} title={title} jobs={j.data.jobs} src={sources} put={(a, b) => { put(a, b); ctx.modal(null); setTimeout(() => ctx.toast('Saved'), 0); }} />); };
  return {
    key: 'ai', name: 'AI', hint: 'Connect one or more providers, then set the order each job tries them in.',
    action: { label: '+ Add AI', act: () => ctx.modal(<AddAi ctx={ctx} shared={false} reload={() => { d.reload(); j.reload(); }} />) },
    groups: [
      { title: 'Providers', rows: sources.map((s) => ({
        id: `ai-${s.id}`, t: 'link' as const, icon: initials(s.name || s.type), label: s.name || s.type,
        hint: s.shared ? `Shared by this server · ${s.model || 'no model yet'}` : `${s.ready ? 'Connected' : s.why || 'Not ready'} · ${s.model || 'no model yet'}`,
        meta: s.shared ? 'Shared' : 'Manage', act: s.shared ? () => ctx.toast('Shared AI is managed by an admin in Server → AI') : manage,
      })) },
      { title: 'Which AI does what · tried in order', rows: JOBS.flatMap(([k, label, hint]) => {
        const c = j.data?.jobs[k];
        if (!c) return [];
        const act = c.order.filter((i) => !c.skip.includes(i));
        return [{ id: `ord-${k}`, t: 'order' as const, label, hint, tog: c.on, togSet: (v: boolean) => put(k, { on: v }), order: { first: act[0] ? nameOf(act[0]) : '—', more: Math.max(0, act.length - 1), open: () => openOrder(k, label) } }];
      }) },
      { title: 'Limits & privacy', rows: [
        { id: 'aiLimit', t: 'select', label: 'Monthly limit across paid providers', hint: 'When it’s reached, jobs move to a free provider or wait.', opts: ['$5', '$10', '$25', 'No limit'], value: prefs.get('aiLimit', '$10'), set: (v) => { prefs.set('aiLimit', v); ctx.toast('Saved'); } },
        { id: 'aiPrivate', t: 'toggle', label: 'Skip photos with hidden tags', hint: 'They’re never sent to any provider.', value: prefs.get('aiPrivate', true), set: (v) => { prefs.set('aiPrivate', v); ctx.toast('Saved'); } },
        { id: 'aiLocalOnly', t: 'toggle', label: 'Keep private shoots on local AI only', hint: 'Shoots marked private never leave this server.', value: prefs.get('aiLocalOnly', true), set: (v) => { prefs.set('aiLocalOnly', v); ctx.toast('Saved'); } },
      ] },
    ],
  };
}

/* ------------------------------------------------------------------- Cloud */
type Prov = { id: string; label: string; configured: boolean };
type Conn = { id: string; provider: string; account: string; folders?: { name: string }[]; intervalMin: number; enabled: boolean };
const EVERY: [string, number][] = [['Every 15 min', 15], ['Every hour', 60], ['Every 6 hours', 360], ['Manually', 0]];
const ABBR: Record<string, string> = { google: 'GD', dropbox: 'DB', onedrive: 'OD' };
export function useCloud(ctx: Ctx): Section {
  const d = useApi<{ providers: Prov[]; connections: Conn[] }>('/cloud');
  const res = useApi<{ saveOriginal: boolean; lockedByAdmin: boolean }>('/cloud/resolution');
  const prefs = usePrefs('user');
  const conns = d.data?.connections ?? [];
  const every = EVERY.find((e) => e[1] === (conns[0]?.intervalMin ?? 60))?.[0] ?? 'Every hour';
  const manage = () => ctx.modal(<Modal title="Cloud folders" sub="Accounts, folders and sync." width={720} onClose={() => { ctx.modal(null); d.reload(); res.reload(); }}><CloudSettings /></Modal>);
  const connect = async (p: string) => { try { const r = await api<{ url: string }>(`/cloud/connect/${p}`, { body: {} }); window.location.href = r.url; } catch (e) { ctx.toast(msg(e)); } };
  const rows = [
    ...conns.map((c) => ({ id: `c-${c.id}`, t: 'link' as const, icon: ABBR[c.provider] ?? c.provider.slice(0, 2).toUpperCase(), label: d.data?.providers.find((p) => p.id === c.provider)?.label ?? c.provider, hint: `Connected${c.account ? ` · ${c.account}` : ''}${c.folders?.length ? ` · ${c.folders.map((f) => f.name || 'whole account').join(', ')}` : ' · choose folders'}`, meta: 'Manage', act: manage })),
    ...(d.data?.providers ?? []).filter((p) => p.configured && !conns.some((c) => c.provider === p.id)).map((p) => ({ id: `p-${p.id}`, t: 'button' as const, icon: ABBR[p.id] ?? p.id.slice(0, 2).toUpperCase(), dim: true, label: p.label, hint: 'Not connected', meta: 'Connect', act: () => void connect(p.id) })),
  ];
  return {
    key: 'cloud', name: 'Cloud folders', hint: 'Bring photos in from other places.',
    groups: [
      { title: 'Connected', rows: rows.length ? rows : [{ id: 'none', t: 'link', label: 'Nothing connected', hint: 'An administrator sets up the services under Server → Storage.', meta: '' }] },
      { title: 'Importing', rows: [
        { id: 'syncEvery', t: 'select', label: 'Check for new photos', opts: EVERY.map((e) => e[0]), value: every, set: async (v: string) => { const n = EVERY.find((e) => e[0] === v)![1]; await act(ctx, () => Promise.all(conns.map((c) => api(`/cloud/${c.id}`, { method: 'PUT', body: { intervalMin: n } })))); d.reload(); } },
        { id: 'grouping', t: 'select', label: 'File new photos as', opts: ['One shoot per day', 'One shoot per folder', 'Ask each time'], value: prefs.get('grouping', 'One shoot per day'), set: (v) => { prefs.set('grouping', v); ctx.toast('Saved'); } },
        { id: 'cloudFullRes', t: 'toggle', label: 'Save original resolution', hint: 'Full-size files, as uploaded. Off: a 4096 px copy, about a tenth of the space.', note: res.data?.lockedByAdmin ? 'Turned off by an admin for everyone on this server. Cloud photos are saved as 4096 px copies.' : undefined, value: !!res.data?.saveOriginal && !res.data?.lockedByAdmin, togDisabled: res.data?.lockedByAdmin ? 'Turned off by an admin' : undefined, set: async (v: boolean) => { await act(ctx, () => api('/cloud/resolution', { method: 'PUT', body: { saveOriginal: v } })); res.reload(); } },
        { id: 'skipDupes', t: 'toggle', label: 'Skip duplicates', hint: 'Matched by content, not filename.', value: prefs.get('skipDupes', true), set: (v) => { prefs.set('skipDupes', v); ctx.toast('Saved'); } },
        { id: 'cloudRO', t: 'link', label: 'Read-only', hint: 'Frames only copies from cloud folders. It never deletes, moves or changes files there.', meta: '' },
      ] },
    ],
  };
}

/* --------------------------------------------------------------- Portfolio */
type PF = { config: { enabled: boolean; host: string; tagline: string; accentColor: string; buttons: { short: string; name: string; url: string }[]; fullSize: 'resized' | 'original' | 'none'; order: string; autoAdd: boolean; autoThreshold: number }; status: { photoCount: number }; dnsTarget: string; handle: string; originalsAllowed: boolean };
const ACCENTS: [string, string][] = [['Clay', 'oklch(0.58 0.13 35)'], ['Blue', 'oklch(0.55 0.11 250)'], ['Green', 'oklch(0.58 0.1 150)'], ['Ink', '#2a2a28']];
const ORDERS: [string, string][] = [['Newest taken first', 'captured'], ['Newest added first', 'newest'], ['Oldest first', 'oldest'], ['By score', 'score']];
const FULL: [string, string][] = [['Resized', 'resized'], ['Original', 'original'], ['Nothing', 'none']];
const SCORES: [string, number][] = [['3.5 or more', 3.5], ['4.0 or more', 4], ['4.5 or more', 4.5]];
export function usePortfolio(ctx: Ctx): Section {
  const d = useApi<PF>('/portfolio');
  const marks = useApi<{ favourites: number[]; out: number[]; hand: number[]; count: number }>('/portfolio/marks');
  const prof = useApi<{ displayName: string; hasAvatar: boolean }>('/profile');
  const prefs = usePrefs('user');
  const c = d.data?.config;
  const save = async (body: object) => { await act(ctx, () => api('/portfolio', { method: 'PUT', body })); d.reload(); marks.reload(); };
  const host = (c?.host || 'photography.example.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const app = (d.data?.dnsTarget || 'frames.example.com');
  const fav = marks.data?.favourites ?? [];
  const nearest = (SCORES.find((s) => s[1] === c?.autoThreshold) ?? SCORES.reduce((a, b) => (Math.abs(b[1] - (c?.autoThreshold ?? 4)) < Math.abs(a[1] - (c?.autoThreshold ?? 4)) ? b : a)))[0];
  return {
    key: 'portfolio', name: 'Portfolio', hint: 'A public website of your best work.',
    action: { label: 'View site ↗', act: () => void openPortfolio() },
    groups: [
      { rows: [
        { id: 'pfLive', t: 'toggle', label: 'Published', hint: c?.enabled ? `Live at ${c.host || (d.data?.handle ? `/${d.data.handle}/` : '/portfolio/')} · ${d.data?.status.photoCount ?? 0} photos` : 'Not published', value: !!c?.enabled, set: (v) => void save({ enabled: v }) },
        { id: 'pfHandle', t: 'text', label: 'Name in the address', hint: `Your portfolio is at ${window.location.origin}/${d.data?.handle || 'your-name'}/. 3 to 30 letters, numbers or hyphens.`, dep: 'pfLive', value: d.data?.handle ?? '', ph: 'your-name', set: (v) => void save({ handle: v }) },
        { id: 'pfHost', t: 'text', label: 'Web address', hint: `Shows only the portfolio. At your DNS provider, add a CNAME record for ${host} pointing to ${app}.`, dep: 'pfLive', value: c?.host ?? '', ph: 'photography.example.com', set: (v) => void save({ host: v }) },
      ] },
      { title: 'What’s shown', rows: [
        { id: 'pfFavs', t: 'link', thumbs: fav.slice(0, 4).map((id) => imgUrl(id, 'thumb')), label: `★ Favourites · ${fav.length}`, hint: 'Pinned to the top. Only you add these.', meta: 'Arrange', act: () => ctx.toast('Star a photo on its page to add it to Favourites') },
        { id: 'pfAutoMin', t: 'selTog', label: 'Add photos automatically', hint: `Any photo whose combined score reaches the threshold. ${marks.data?.count ?? 0} photos right now.`, prefix: 'Score ', opts: SCORES.map((s) => s[0]), value: nearest, set: (v) => void save({ autoThreshold: SCORES.find((s) => s[0] === v)![1] }), tog: !!c?.autoAdd, togSet: (v) => void save({ autoAdd: v }) },
        { id: 'pfHand', t: 'link', label: `Added by hand · ${marks.data?.hand.length ?? 0}`, hint: 'From a photo’s page or a Library selection.', meta: 'See all', act: () => ctx.modal(<Modal title="Added to portfolio by hand" sub="Manage this selection here. Removing a photograph keeps it in your library." onClose={() => ctx.modal(null)} width={640}><PortfolioSelection onChanged={() => { marks.reload(); d.reload(); }} /></Modal>) },
        { id: 'pfOut', t: 'link', label: `Left out · ${marks.data?.out.length ?? 0}`, hint: 'Never shown, even if they meet the score.', meta: 'See all', act: () => ctx.toast('Use “Leave out” on a photo’s page to change this') },
        { id: 'pfOrder', t: 'select', label: 'Order', opts: ORDERS.map((o) => o[0]), value: ORDERS.find((o) => o[1] === c?.order)?.[0] ?? 'Newest taken first', set: (v) => void save({ order: ORDERS.find((o) => o[0] === v)![1] }) },
      ] },
      { title: 'The site', rows: [
        { id: 'pfName', t: 'link', avatar: { name: prof.data?.displayName ?? '', src: prof.data?.hasAvatar ? '/api/profile/avatar' : undefined }, label: 'Name & picture', hint: 'From your profile', meta: 'Edit', act: () => ctx.goto('lib', 'profile') },
        { id: 'pfTagline', t: 'text', label: 'Tagline', value: c?.tagline ?? '', ph: 'Film photographer from…', set: (v) => void save({ tagline: v }) },
        { id: 'pfAccent', t: 'swatch', label: 'Accent', swatches: ACCENTS, value: ACCENTS.find((a) => a[1] === c?.accentColor)?.[0] ?? 'Clay', set: (v) => void save({ accentColor: ACCENTS.find((a) => a[0] === v)![1] }) },
        { id: 'pfButtons', t: 'links', label: 'Menu links', hint: 'Shown after Index, Favourites and Gear, in this order. Each needs a full name, a short name (up to 4 characters or an emoji) and a link.', value: c?.buttons ?? [], max: 8, set: (v: { short: string; name: string; url: string }[]) => void save({ buttons: v }) },
        { id: 'pfGear', t: 'button', label: 'Gear page', hint: 'Synced from your gear list. The want-to-buy list is optional.', meta: 'Open gear →', act: () => window.location.assign('/gear') },
        { id: 'pfFull', t: 'seg', label: 'Opening a photo shows', hint: 'Camera data is removed from resized copies.', opts: FULL.map((x) => x[0]), value: FULL.find((x) => x[1] === c?.fullSize)?.[0] ?? 'Resized', set: (v) => void save({ fullSize: FULL.find((x) => x[0] === v)![1] }) },
        { id: 'pfFilters', t: 'toggle', label: 'Subject filters', hint: 'Buttons above “All work”.', value: prefs.get('pfFilters', true), set: (v) => { prefs.set('pfFilters', v); ctx.toast('Saved'); } },
      ] },
    ],
  };
}

/* -------------------------------------------------------------------- Data */
const PV_SIZES = [1600, 2400, 3072, 4096];
const PV_QUALITY = [70, 75, 80, 85, 88, 90, 95];
export function useData(ctx: Ctx): Section {
  const s = useApi<{ photos?: unknown[] }>('/library/pending');
  const sys = useApi<{ cache: { bytes: number } }>(ctx.isAdmin ? '/admin/system' : null);
  const summary = useApi<{ total: number }>('/review/summary');
  const pv = useApi<{ settings: { previewPx: number; previewQuality: number }; limits: { previewPx: number; previewQuality: number } }>('/settings');
  const cv = useApi<{ running: boolean; done: number; total: number; outdated: number }>('/library/convert/status');
  useEffect(() => { if (!cv.data?.running) return; const t = setInterval(cv.reload, 1500); return () => clearInterval(t); }, [cv.data?.running]); // eslint-disable-line react-hooks/exhaustive-deps
  const startConvert = async () => { await act(ctx, () => api('/library/convert', { body: {} }), 'Converting previews in the background'); cv.reload(); };
  // After a change of size or quality, offer to convert the previews already made.
  const savePv = async (body: object) => {
    await act(ctx, () => api('/settings', { method: 'PUT', body })); pv.reload();
    const st = await api<{ outdated: number }>('/library/convert/status').catch(() => null); cv.reload();
    if (st && st.outdated > 0 && window.confirm(`Convert the ${st.outdated.toLocaleString()} existing preview${st.outdated === 1 ? '' : 's'} to the new setting now?\n\nThis runs in the background. Your original files are not touched.`)) await startConvert();
  };
  const gb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
  void s;
  const manage = () => ctx.modal(<Modal title="Your data" sub="Back up, delete or reset everything Frames keeps for you." width={680} onClose={close(ctx)}><YourData /></Modal>);
  return {
    key: 'data', name: 'Your data', hint: 'Take everything with you.',
    groups: [
      { title: 'Storage', rows: [
        { id: 'stLib', t: 'meter', label: 'Library', hint: `${(summary.data?.total ?? 0).toLocaleString()} photos · originals untouched`, pct: 100, text: `${(summary.data?.total ?? 0).toLocaleString()} photos` },
        { id: 'stCache', t: 'button', label: 'Previews & thumbnails', hint: `${sys.data ? gb(sys.data.cache.bytes) + ' · ' : ''}rebuilt when needed`, meta: 'Clear', act: async () => { if (!window.confirm('Clear all previews and thumbnails? They are made again in the background.')) return; await act(ctx, () => api('/library/clear-cache', { body: {} }), 'Previews cleared · they’ll rebuild in the background'); sys.reload(); } },
        { id: 'pvSize', t: 'select', label: 'Preview size', hint: 'What you see on the Photo page and in Review. Smaller saves space. Sizes above the server’s limit are greyed out. Clear previews above to apply it to photos already here.', opts: PV_SIZES.map((x) => `${x} px`), offOpts: PV_SIZES.filter((x) => x > (pv.data?.limits.previewPx ?? 4096)).map((x) => `${x} px`), value: `${Math.min(pv.data?.settings.previewPx ?? 2400, pv.data?.limits.previewPx ?? 4096)} px`, set: (v: string) => void savePv({ previewPx: parseInt(v, 10) }) },
        { id: 'pvQuality', t: 'select', label: 'Preview quality', hint: 'JPEG quality, 70 to 95. Lower makes smaller files; 85 is hard to tell apart on screen. Values above the server’s limit are greyed out.', opts: PV_QUALITY.map(String), offOpts: PV_QUALITY.filter((x) => x > (pv.data?.limits.previewQuality ?? 95)).map(String), value: String(Math.min(pv.data?.settings.previewQuality ?? 85, pv.data?.limits.previewQuality ?? 95)), set: (v: string) => void savePv({ previewQuality: Number(v) }) },
        { id: 'pvConvert', t: 'button', label: 'Convert existing previews', hint: cv.data?.running ? `Converting… ${cv.data.done.toLocaleString()} of ${cv.data.total.toLocaleString()}` : (cv.data?.outdated ?? 0) > 0 ? `${cv.data!.outdated.toLocaleString()} preview${cv.data!.outdated === 1 ? ' was' : 's were'} made with other settings. Converts them to the size and quality above.` : 'Every preview matches your settings.', meta: cv.data?.running ? 'Working…' : 'Convert', act: () => { if (cv.data?.running) return; if (!(cv.data?.outdated ?? 0)) { ctx.toast('Nothing to convert'); return; } void startConvert(); } },
      ] },
      { title: 'Export', rows: [
        { id: 'exportAll', t: 'button', label: 'Everything', hint: 'Ratings, tags and compositions as a library backup.', meta: 'Export', act: () => { window.location.href = '/api/backup'; ctx.toast('Downloading your library backup'); } },
        { id: 'exportCsv', t: 'button', label: 'Ratings as CSV', meta: 'Download', act: () => { window.location.href = '/api/ratings.csv'; ctx.toast('Downloading ratings.csv'); } },
        { id: 'exportXmp', t: 'button', label: 'Write all XMP sidecars now', hint: 'Titles, descriptions, accepted tags and ratings.', meta: 'Write', act: async () => { try { const r = await api<{ written: number }>('/metadata/export', { body: {} }); ctx.toast(`Wrote ${r.written} XMP sidecars`); } catch (e) { ctx.toast(msg(e)); } } },
      ] },
      { title: 'Danger zone', rows: [
        { id: 'resetRatings', t: 'button', danger: true, label: 'Reset all ratings', hint: 'Scores start again. Photos stay.', meta: 'Reset…', act: async () => { if (window.prompt('This forgets every rating you and your guests gave. Type “reset” to confirm.') !== 'reset') return; await act(ctx, () => api('/reviews/reset', { body: { confirm: 'reset' } }), 'Every rating was reset'); } },
        { id: 'del', t: 'button', danger: true, label: 'Delete my account', hint: 'Photos on disk are not touched.', meta: 'Delete…', act: manage },
      ] },
    ],
  };
}

export { Profile };
