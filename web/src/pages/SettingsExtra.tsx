import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal, Spinner } from '../components/Modal';

const Sw = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => <button role="switch" aria-checked={on} aria-label={label} className={'sw' + (on ? ' on' : '')} onClick={onClick} />;
const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="toggle" style={{ padding: '12px 0', borderTop: '1px solid var(--hair)' }}><div><div style={{ fontSize: 14 }}>{title}</div>{hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}</div>{children}</div>
);

const KINDS: { k: string; label: string; hint: string; email?: boolean }[] = [
  { k: 'guest-suggestion', label: 'Guest suggestions', hint: 'A guest suggested changes to a composition', email: true },
  { k: 'guest-reply', label: 'Guest replies and ratings', hint: 'A guest rated photos or left a note', email: true },
  { k: 'review-due', label: 'Photos due for review', hint: 'Ratings that are due', email: true },
  { k: 'summary', label: 'Monthly summary', hint: 'On the 1st: photos added and rated, your top photos', email: true },
  { k: 'sign-in', label: 'New sign-ins', hint: 'Someone signed in from a new device', email: true },
  { k: 'community-rating', label: 'Community ratings', hint: 'Someone in the community rated your photo' },
  { k: 'idea', label: 'Composition ideas', hint: 'Frames found a set that belongs together' },
  { k: 'cloud-sync', label: 'Cloud photos to organise', hint: 'A sync brought in photos that need a name' },
  { k: 'report-outcome', label: 'Report outcomes', hint: 'What an administrator decided about a photo' },
];

type Prefs = { bell: Record<string, boolean>; email: Record<string, boolean>; quiet: { on: boolean; from: string; to: string }; tz: string; reviewReminder: 'off' | 'daily' | 'weekly' };

/** Settings, Notifications: what shows in the bell, what is emailed, and quiet hours. */
export function NotificationSettings() {
  const d = useApi<{ prefs: Prefs }>('/notifications/prefs');
  const smtp = useApi<{ smtpHealthy: boolean }>('/config/status');
  const [err, setErr] = useState('');
  useEffect(() => { // the browser's time zone is the default for quiet hours, until the person picks one
    if (d.data && !d.data.prefs.tz || d.data?.prefs.tz === 'UTC') { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && tz !== 'UTC') api('/notifications/prefs', { method: 'PUT', body: { tz } }).then(d.reload).catch(() => undefined); } catch { /* none */ } }
  }, [d.data?.prefs.tz]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return <p className="empty">Loading…</p>;
  const p = d.data.prefs;
  const put = async (body: object) => { setErr(''); try { await api('/notifications/prefs', { method: 'PUT', body }); d.reload(); } catch (e) { setErr((e as Error).message); } };
  const emailOk = !!smtp.data?.smtpHealthy;
  return (
    <>
      {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}
      <div className="field">
        <h3>What you are told about</h3>
        <p>The bell always shows these. Email is only for the ones marked, and only if this server can send mail{emailOk ? '' : ' (it cannot right now, so the email switches are off)'}.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 28, alignItems: 'center' }}>
          <span /><span className="eyebrow">Bell</span><span className="eyebrow">Email</span>
          {KINDS.map((k) => (
            <div key={k.k} style={{ display: 'contents' }}>
              <div style={{ padding: '10px 0', borderTop: '1px solid var(--hair)' }}><div style={{ fontSize: 14 }}>{k.label}</div><div className="muted" style={{ fontSize: 12.5 }}>{k.hint}</div></div>
              <div style={{ borderTop: '1px solid var(--hair)', padding: '10px 0' }}><Sw label={`${k.label} in the bell`} on={p.bell[k.k] !== false} onClick={() => put({ bell: { [k.k]: p.bell[k.k] === false } })} /></div>
              <div style={{ borderTop: '1px solid var(--hair)', padding: '10px 0' }}>{k.email ? <Sw label={`${k.label} by email`} on={emailOk && !!p.email[k.k]} onClick={() => emailOk && put({ email: { [k.k]: !p.email[k.k] } })} /> : <span className="faint">—</span>}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <h3>Review reminder</h3>
        <p>An email when photos are due. Weekly is Monday 09:00 your time, and only when something is due.</p>
        <div className="seg">{(['off', 'daily', 'weekly'] as const).map((r) => <button key={r} className={p.reviewReminder === r ? 'on' : ''} onClick={() => put({ reviewReminder: r })} style={{ textTransform: 'capitalize' }} disabled={!emailOk}>{r}</button>)}</div>
      </div>
      <div className="field">
        <h3>Quiet hours</h3>
        <p>Emails wait until quiet hours end. The bell is never held back.</p>
        <Row title="Hold emails overnight" hint={`${p.quiet.from}–${p.quiet.to} in ${p.tz || 'your time zone'}`}><Sw label="Quiet hours" on={p.quiet.on} onClick={() => put({ quiet: { on: !p.quiet.on } })} /></Row>
        {p.quiet.on && (
          <div className="form" style={{ paddingTop: 8 }}>
            <label>From <input type="time" value={p.quiet.from} onChange={(e) => e.target.value && put({ quiet: { from: e.target.value } })} /></label>
            <label>To <input type="time" value={p.quiet.to} onChange={(e) => e.target.value && put({ quiet: { to: e.target.value } })} /></label>
            <label>Time zone <input value={p.tz} onChange={(e) => e.target.value && e.target.value.length > 2 && put({ tz: e.target.value })} style={{ width: 200 }} aria-label="Time zone" /></label>
          </div>
        )}
      </div>
    </>
  );
}

type Email = { smtp: { host: string; port: number; secure: boolean; user: string; from: string; fromName: string }; hasPassword: boolean; configured: boolean; health: { ok: boolean; at: string; error: string } | null; emailSignIn: boolean; fromEnv: boolean };
type Log = { id: number; at: string; to: string; subject: string; type: string; status: 'delivered' | 'failed'; error: string };

/** Settings, Server, Email: SMTP, its health check, a test email, the sign-in switch, and the log of what was sent. */
export function EmailSettings() {
  const e = useApi<Email>('/admin/email');
  const [f, setF] = useState<Partial<Email['smtp']> & { password?: string }>({});
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState<'all' | 'delivered' | 'failed'>('all');
  const log = useApi<{ rows: Log[] }>(`/admin/email/log${filter === 'all' ? '' : `?status=${filter}`}`);
  const [code, setCode] = useState<string | null>(null);
  const d = e.data;
  if (!d) return <p className="empty">Loading…</p>;
  const v = { ...d.smtp, ...f };
  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => { setBusy(name); setMsg(null); try { await fn(); setMsg({ ok: true, t: ok }); e.reload(); log.reload(); } catch (x) { setMsg({ ok: false, t: (x as Error).message }); } finally { setBusy(''); } };
  const h = d.health;
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.t}</span></div>}
      <div className="field">
        <h3>Outgoing mail (SMTP)</h3>
        <p>Used for sign-in codes, invites, share links and reminders. Off means no one gets email, and share links are copy-and-paste only.{d.fromEnv && ' Some values come from SMTP_* environment variables.'}</p>
        <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: 520 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-in" style={{ height: 40 }} placeholder="Host, e.g. smtp.example.com" aria-label="SMTP host" value={v.host} onChange={(x) => setF({ ...f, host: x.target.value })} />
            <input className="field-in" style={{ height: 40, width: 100 }} placeholder="Port" inputMode="numeric" aria-label="Port" value={v.port} onChange={(x) => setF({ ...f, port: Number(x.target.value.replace(/\D/g, '')) })} />
          </div>
          <label className="check"><input type="checkbox" checked={v.secure} onChange={(x) => setF({ ...f, secure: x.target.checked })} /> Secure connection from the start (usually port 465). Otherwise STARTTLS is used.</label>
          <input className="field-in" style={{ height: 40 }} placeholder="User name" aria-label="SMTP user" autoComplete="off" value={v.user} onChange={(x) => setF({ ...f, user: x.target.value })} />
          <input className="field-in" style={{ height: 40 }} type="password" placeholder={d.hasPassword ? 'Password (saved. Type to replace)' : 'Password'} aria-label="SMTP password" autoComplete="new-password" value={f.password ?? ''} onChange={(x) => setF({ ...f, password: x.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-in" style={{ height: 40 }} placeholder="Send as, e.g. frames@example.com" aria-label="Send as" value={v.from} onChange={(x) => setF({ ...f, from: x.target.value })} />
            <input className="field-in" style={{ height: 40, width: 160 }} placeholder="Name" aria-label="From name" value={v.fromName} onChange={(x) => setF({ ...f, fromName: x.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={!!busy || Object.keys(f).length === 0} onClick={() => run('save', async () => { await api('/admin/email', { method: 'PUT', body: f }); setF({}); }, 'Saved. The connection was checked.')}>Save and check</button>
            {d.configured && <button className="btn outline" disabled={!!busy} onClick={() => run('check', () => api('/admin/email/check', { body: {} }), 'Checked.')}>{busy === 'check' ? <Spinner /> : 'Check again'}</button>}
          </div>
          {d.configured && (
            <div style={{ fontSize: 13, color: h?.ok ? 'var(--ok)' : 'var(--err)' }} role="status">
              {!h ? 'Not checked yet.' : h.ok ? `✓ Working · checked ${new Date(h.at).toLocaleString()}` : `✕ Not working: ${h.error}`}
            </div>
          )}
        </div>
      </div>
      {d.configured && (
        <div className="field">
          <h3>Send a test email</h3>
          <div className="form"><input className="field-in" style={{ height: 40, width: 280 }} type="email" placeholder="Send to (blank = you)" value={to} onChange={(x) => setTo(x.target.value)} aria-label="Test address" /><button className="btn outline" disabled={!!busy} onClick={() => run('test', () => api('/admin/email/test', { body: { to } }), 'Test email sent.')}>{busy === 'test' ? <Spinner /> : 'Send test email'}</button></div>
        </div>
      )}
      <div className="field">
        <h3>Sign in with an emailed code</h3>
        <p>Offered on the sign-in page only while the check above passes. If it fails, the option disappears by itself; Google, Cloudflare Access and the shared password are unaffected.</p>
        <Row title="Let people sign in with a code" hint={h?.ok ? '' : 'Needs a passing check first.'}>
          <Sw label="Email sign-in" on={d.emailSignIn} onClick={() => h?.ok && run('si', () => api('/auth/config', { method: 'PUT', body: { email: !d.emailSignIn } }), d.emailSignIn ? 'Email sign-in is off.' : 'Email sign-in is on.')} />
        </Row>
        {d.emailSignIn && (
          <div style={{ paddingTop: 8 }}>
            {code === null
              ? <button className="btn outline" onClick={() => run('stest', async () => { await api('/admin/email/signin-test', { body: {} }); setCode(''); }, 'A code was sent to your email address. Enter it to prove this works.')}>Test it: email me a code</button>
              : <div className="form"><input className="field-in" style={{ height: 40, width: 160, textTransform: 'uppercase', letterSpacing: '.2em' }} maxLength={6} value={code} onChange={(x) => setCode(x.target.value.toUpperCase())} aria-label="Code" /><button className="btn primary" onClick={() => run('stest2', async () => { await api('/admin/email/signin-test', { body: { code } }); setCode(null); }, 'It works. Email sign-in can now stand on its own.')}>Confirm</button></div>}
          </div>
        )}
      </div>
      <div className="field" style={{ maxWidth: 'none' }}>
        <div className="spread" style={{ alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Email log</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="seg">{(['all', 'delivered', 'failed'] as const).map((k) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)} style={{ textTransform: 'capitalize' }}>{k}</button>)}</div>
            <button className="btn outline" style={{ height: 32 }} onClick={() => run('retry', async () => { const r = await api<{ sent: number }>('/admin/email/log/retry', { body: {} }); setMsg({ ok: true, t: `${r.sent} resent.` }); }, 'Retried.')} disabled={!log.data?.rows.some((r) => r.status === 'failed')}>Retry failed</button>
            <a className="btn outline" style={{ height: 32 }} href="/api/admin/email/log.csv" download>Download CSV</a>
          </div>
        </div>
        <p>The last 30 days. Message bodies are never stored.</p>
        <table className="cmp-table" style={{ fontSize: 13 }}>
          <thead><tr>{['When', 'To', 'Subject', 'Type', 'Status'].map((h2) => <th key={h2} style={{ width: 'auto' }}>{h2}</th>)}</tr></thead>
          <tbody>{(log.data?.rows ?? []).slice(0, 60).map((r) => (
            <tr key={r.id} title={r.error || undefined}><td className="mono" style={{ fontSize: 12 }}>{new Date(r.at).toLocaleString()}</td><td>{r.to}</td><td>{r.subject}</td><td className="muted">{r.type}</td><td style={{ color: r.status === 'failed' ? 'var(--err)' : 'var(--ok)' }}>{r.status}{r.status === 'failed' && r.error ? ` · ${r.error}` : ''}</td></tr>
          ))}</tbody>
        </table>
        {log.data && log.data.rows.length === 0 && <p className="muted">Nothing sent yet.</p>}
      </div>
    </>
  );
}

type Community = { optIn: boolean; share: 'any' | 'portfolio' | 'rated4'; written: boolean; showOnHome: boolean };

/** Settings, Reviews, Community: opt in so others rate your photos, and what they may see. */
export function CommunitySettings() {
  const c = useApi<Community>('/community/prefs');
  if (!c.data) return null;
  const put = (body: Partial<Community>) => api('/community/prefs', { method: 'PUT', body }).then(c.reload).catch(() => undefined);
  const p = c.data;
  return (
    <div className="field">
      <h3>Community</h3>
      <p>Rate other photographers’ work and let them rate yours. Always anonymous both ways.</p>
      <Row title="Let other Frames users review my photos" hint="Anonymous. Photos tagged nudity, violence or adult are never shown."><Sw label="Let other Frames users review my photos" on={p.optIn} onClick={() => put({ optIn: !p.optIn })} /></Row>
      {p.optIn && (
        <>
          <Row title="Share"><select value={p.share} onChange={(e) => put({ share: e.target.value as Community['share'] })} aria-label="Which photos to share"><option value="any">Any photo</option><option value="portfolio">Only my portfolio photos</option><option value="rated4">Only photos I rated 4 or better</option></select></Row>
          <Row title="Allow written feedback"><Sw label="Allow written feedback" on={p.written} onClick={() => put({ written: !p.written })} /></Row>
        </>
      )}
      <Row title="Show Community review on Home"><Sw label="Show Community review on Home" on={p.showOnHome} onClick={() => put({ showOnHome: !p.showOnHome })} /></Row>
    </div>
  );
}

type Report = { id: number; owner: string; token: string; reason: string; reporters: number; at: string; byAdmin: boolean };
/** Settings, Members, Reports: community photos reported by members. Keep or Remove. */
export function ReportsQueue() {
  const r = useApi<{ reports: Report[] }>('/admin/community/reports');
  const [err, setErr] = useState('');
  const act = async (id: number, decision: 'keep' | 'remove') => { try { await api(`/admin/community/reports/${id}`, { body: { decision } }); r.reload(); } catch (e) { setErr((e as Error).message); } };
  if (!r.data) return null;
  return (
    <div className="field" id="reports" style={{ maxWidth: 'none' }}>
      <h3>Reports queue</h3>
      <p>Photos from community review that members reported. A photo is hidden from everyone after 2 reports, or 1 from an administrator, until you decide.</p>
      {err && <div className="reason">{err}</div>}
      {r.data.reports.length === 0 && <p className="muted">Nothing waiting.</p>}
      {r.data.reports.map((x) => (
        <div key={x.id} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--hair)' }}>
          <img src={`/api/admin/community/image/${x.token}`} alt="Reported photo" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 6 }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14 }}>{x.reason.replace(/-/g, ' ')} · {x.reporters} report{x.reporters === 1 ? '' : 's'}{x.byAdmin ? ' · by an admin' : ''}</div><div className="muted" style={{ fontSize: 12.5 }}>Photo by {x.owner} · {new Date(x.at).toLocaleDateString()}</div></div>
          <button className="btn outline" onClick={() => act(x.id, 'keep')}>Keep</button>
          <button className="btn outline" style={{ color: 'var(--danger)' }} onClick={() => act(x.id, 'remove')}>Remove</button>
        </div>
      ))}
    </div>
  );
}

/** Settings, Cloud sync: save the full-size original, or a 4096 px copy. Frames never changes anything in the cloud account. */
export function CloudResolution() {
  const r = useApi<{ saveOriginal: boolean; want: boolean; lockedByAdmin: boolean; shrunkCount: number; shrunkBytes: number }>('/cloud/resolution');
  const [msg, setMsg] = useState('');
  if (!r.data) return null;
  const d = r.data;
  return (
    <div className="field">
      <h3>Save original resolution</h3>
      <p>On: imports from the cloud keep the full-size file. Off: Frames stores a copy up to 4096 px on its long edge. This only affects photos imported from now on. Frames never deletes, moves or edits anything in your cloud account.</p>
      <Row title="Save original resolution" hint={d.lockedByAdmin ? 'Turned off by an admin' : undefined}><Sw label="Save original resolution" on={d.saveOriginal} onClick={() => !d.lockedByAdmin && api('/cloud/resolution', { method: 'PUT', body: { saveOriginal: !d.want } }).then(r.reload)} /></Row>
      {d.saveOriginal && d.shrunkCount > 0 && (
        <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 13.5 }}>
          Fetch full-size copies of {d.shrunkCount.toLocaleString()} photo{d.shrunkCount === 1 ? '' : 's'} already imported? About {(d.shrunkBytes / 1e9 >= 1 ? `${(d.shrunkBytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(d.shrunkBytes / 1e6))} MB`)} more.
          <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
            <button className="btn primary" style={{ height: 34 }} onClick={() => api('/cloud/resolution/fetch', { body: {} }).then(() => setMsg('Fetching in the background. Photos update as they arrive.')).catch((e: Error) => setMsg(e.message))}>Fetch</button>
            <button className="muted" onClick={() => setMsg('Not now.')}>Not now</button>
            {msg && <span className="muted" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Settings, Server, Photos & storage: the administrator's switch for full-size cloud imports. */
export function CloudOriginalsAdmin() {
  const r = useApi<{ allow: boolean }>('/admin/cloud-originals');
  if (!r.data) return null;
  return (
    <div className="field">
      <h3>Allow original resolution from the cloud</h3>
      <p>When off, every person’s “Save original resolution” shows as off and disabled, and all cloud imports are stored as 4096 px copies.</p>
      <Row title="Allow original resolution from the cloud"><Sw label="Allow original resolution from the cloud" on={r.data.allow} onClick={() => api('/admin/cloud-originals', { method: 'PUT', body: { allow: !r.data!.allow } }).then(r.reload)} /></Row>
    </div>
  );
}

const JOB_LABEL: Record<string, [string, string]> = { search: ['Search', 'Understand what you type in the search box'], describe: ['Describe & tag', 'Titles, descriptions, subjects and tags'], sensitive: ['Sensitive flagging', 'Suggest nudity, violence or adult tags'], ideas: ['Composition ideas', 'Sets that belong together'] };
type JobCfg = { on: boolean; order: string[]; skip: string[] };

/** Settings, AI: which AI does what, tried in order. Each job has a switch and an order button that opens the order list. */
export function AiJobs() {
  const j = useApi<{ jobs: Record<string, JobCfg> }>('/ai/jobs');
  const src = useApi<{ sources: { id: string; name: string; model?: string; shared?: boolean }[] }>('/ai/sources');
  const [open, setOpen] = useState<string | null>(null);
  if (!j.data || !src.data || src.data.sources.length === 0) return null;
  const name = (id: string) => { const s = src.data!.sources.find((x) => x.id === id); return s ? (s.name || id) + (s.model ? ` · ${s.model}` : '') : id; };
  const put = (job: string, body: object) => api(`/ai/jobs/${job}`, { method: 'PUT', body }).then(j.reload).catch(() => undefined);
  const cfg = open ? j.data.jobs[open] : null;
  const move = (i: number, by: number) => { if (!cfg || !open) return; const o = [...cfg.order]; const k = i + by; if (k < 0 || k >= o.length) return; [o[i], o[k]] = [o[k], o[i]]; void put(open, { order: o }); };
  return (
    <div className="field">
      <h3>Which AI does what · tried in order</h3>
      <p>Each job uses the first provider in its order. If that one is offline, errors or has hit its limit, the next takes over. New providers join the end of every list.</p>
      {Object.entries(JOB_LABEL).map(([k, [title, hint]]) => {
        const c = j.data!.jobs[k];
        const active = c.order.filter((i) => !c.skip.includes(i));
        return (
          <Row key={k} title={title} hint={hint}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {c.on && <button className="btn outline" style={{ height: 32, fontSize: 13 }} onClick={() => setOpen(k)} aria-label={`Order for ${title}`}>{active.length ? `1 ${name(active[0]).split(' · ')[0]}${active.length > 1 ? ` · then ${active.length - 1} more` : ''}` : 'None'} ↕</button>}
              <Sw label={title} on={c.on} onClick={() => put(k, { on: !c.on })} />
            </div>
          </Row>
        );
      })}
      {open && cfg && (
        <Modal title={`${JOB_LABEL[open][0]} · order`} sub="Top to bottom. The job uses #1; if it fails, the next takes over." width={520} onClose={() => setOpen(null)} foot={<><span className="grow" /><button className="btn primary" onClick={() => setOpen(null)}>Done</button></>}>
          {cfg.order.map((id, i) => {
            const skipped = cfg.skip.includes(id);
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--hair)' : 0, opacity: skipped ? 0.5 : 1 }}>
                <span className="mono faint" style={{ width: 18 }}>{i + 1}</span><span style={{ flex: 1 }}>{name(id)}</span>
                <button aria-label="Move up" disabled={i === 0} className="faint" onClick={() => move(i, -1)}>▲</button><button aria-label="Move down" disabled={i === cfg.order.length - 1} className="faint" onClick={() => move(i, 1)}>▼</button>
                <button className="btn outline" style={{ height: 30, fontSize: 12.5 }} onClick={() => put(open, { skip: skipped ? cfg.skip.filter((x) => x !== id) : [...cfg.skip, id] })}>{skipped ? 'Use' : 'Skip'}</button>
              </div>
            );
          })}
        </Modal>
      )}
    </div>
  );
}

/** Settings, Server, Photos & storage: where XMP sidecar files go, for everyone (it changes files on disk). */
export function XmpLocationAdmin() {
  const r = useApi<{ location: 'next' | 'folder' }>('/admin/xmp-location');
  if (!r.data) return null;
  const set = (location: string) => api('/admin/xmp-location', { method: 'PUT', body: { location } }).then(r.reload).catch(() => undefined);
  return (
    <div className="field">
      <h3>XMP sidecars</h3>
      <p>Where sidecar files with ratings and tags are written. It is a server-wide setting because it changes files on disk for everyone. Each person still chooses whether to write ratings and tags (Camera &amp; XMP).</p>
      <Row title="Write sidecars"><div className="seg"><button className={r.data.location === 'next' ? 'on' : ''} onClick={() => set('next')}>Next to the photo</button><button className={r.data.location === 'folder' ? 'on' : ''} onClick={() => set('folder')}>In a Frames folder</button></div></Row>
    </div>
  );
}
