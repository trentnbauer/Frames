import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';

type ShareLink = {
  id: number; token: string; label: string; allowDownload: boolean; allowReview: boolean; allowSuggest: boolean; onlyWall: boolean; askName: boolean; pin: string;
  expiresAt: string | null; status: 'active' | 'expired' | 'revoked'; views: number; downloads: number; reviews: number;
};
type Invite = { email: string; status: 'sent' | 'failed'; error: string; at: string };

const urlOf = (t: string) => `${window.location.origin}/s/${t}`;
const EXPIRY: [string, number | null][] = [['1 week', 7], ['3 weeks', 21], ['3 months', 92], ['Never', null]];
const inDays = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); d.setHours(23, 59, 59, 0); return d.toISOString(); };
const expiryLabel = (iso: string | null) => {
  if (!iso) return 'Never';
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return EXPIRY.filter(([, n]) => n !== null).sort((a, b) => Math.abs((a[1] as number) - days) - Math.abs((b[1] as number) - days))[0][0];
};

/** A segmented choice, as in the design: a pill track with the chosen option filled. */
function Seg({ options, value, onPick, label }: { options: string[]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--hover)', fontSize: 13 }}>
      {options.map((o) => <button key={o} aria-pressed={value === o} onClick={() => onPick(o)} style={{ padding: '5px 12px', borderRadius: 999, background: value === o ? 'var(--btn-bg)' : 'transparent', color: value === o ? 'var(--btn-fg)' : 'var(--text2)' }}>{o}</button>)}
    </div>
  );
}
const Switch = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => <button role="switch" aria-checked={on} aria-label={label} className={'sw' + (on ? ' on' : '')} onClick={onClick} />;
const Row = ({ title, hint, last, children }: { title: string; hint?: string; last?: boolean; children: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: last ? 0 : '1px solid var(--hair)' }}>
    <div><div style={{ fontSize: 14 }}>{title}</div>{hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}</div>{children}
  </div>
);

/** Share <name>: the link, what guests can do, who sees what, expiry, a name, a PIN, email, and Stop sharing / Preview as guest / Done. */
export function SharePanel({ kind, id, name, onClose }: { kind: 'collection' | 'shoot'; id: number; name?: string; onClose: () => void }) {
  const links = useApi<ShareLink[]>(`/shares?kind=${kind}&id=${id}`);
  const [copied, setCopied] = useState('');
  const [fresh, setFresh] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [pinEdit, setPinEdit] = useState('');
  const link = links.data?.find((l) => l.status === 'active') ?? null;
  const inv = useApi<{ invites: Invite[]; canEmail: boolean }>(link ? `/shares/${link.id}/invites` : null);
  useEffect(() => setPinEdit(link?.pin ?? ''), [link?.pin]);
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); links.reload(); } catch (e) { setErr((e as Error).message); } };
  const start = () => run(() => api('/shares', { body: { kind, id, allowReview: true, allowSuggest: true, onlyWall: false } }));
  const patch = (body: object) => link && run(() => api(`/shares/${link.id}`, { method: 'PATCH', body }));
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); } catch { window.prompt('Copy this', text); } setCopied(key); setTimeout(() => setCopied(''), 1800); };
  const stop = () => link && run(() => api(`/shares/${link.id}`, { method: 'DELETE' }));
  const regen = () => link && run(async () => { await api(`/shares/${link.id}/regenerate`, { body: {} }); setFresh(true); setTimeout(() => setFresh(false), 1500); });
  const send = async () => {
    if (!link || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    try { await api(`/shares/${link.id}/invites`, { body: { emails: [email.trim()] } }); setEmail(''); inv.reload(); } catch (e) { setErr((e as Error).message); }
  };
  const perms: [string, string, boolean][] = link ? [['rate', 'Rate photos', link.allowReview], ['suggest', 'Suggest changes', link.allowSuggest], ['dl', 'Download files', link.allowDownload]] : [];
  const setPerm = (k: string, v: boolean) => patch(k === 'rate' ? { allowReview: v } : k === 'suggest' ? { allowSuggest: v } : { allowDownload: v });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Modal title={`Share ${name ?? (kind === 'shoot' ? 'this photoshoot' : 'this composition')}`} sub="Anyone with the link can see the wall and its candidates. Nothing changes until you approve it." width={580} onClose={onClose}
      foot={<>
        <button style={{ flex: 1, textAlign: 'left', fontSize: 13.5, color: 'var(--danger)', opacity: link ? 1 : 0.35 }} onClick={stop} disabled={!link}>Stop sharing</button>
        {link ? <a className="btn outline" href={urlOf(link.token)} target="_blank" rel="noopener noreferrer">Preview as guest</a> : <span className="btn outline disabled">Preview as guest</span>}
        <button className="btn primary" onClick={onClose}>Done</button></>}>
      {err && <div className="reason" role="alert" style={{ margin: 0 }}>{err}</div>}
      {link ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="mono" style={{ flex: 1, height: 42, borderRadius: 8, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', transition: 'background .3s', background: fresh ? 'var(--chip)' : 'var(--bg)' }}>{urlOf(link.token).replace(/^https?:\/\//, '')}</span>
            <button className="btn primary" style={{ height: 42, flex: 'none' }} onClick={() => copy(urlOf(link.token), 'link')}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
          </div>
          <div className="spread" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            <span>{link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : 'Never expires'}{link.pin ? ' · PIN on' : ''}{fresh ? ' · New link made, the old one stops working' : ''}</span>
            <button style={{ color: 'var(--text2)' }} onClick={regen}>New link</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--hair)' }}>
          <span style={{ fontSize: 13.5, color: 'var(--text2)' }}>Not shared. No one can open this wall.</span>
          <button className="btn primary" onClick={start}>Create link</button>
        </div>
      )}
      {link && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">Guests can</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {perms.filter(([k]) => k !== 'suggest' || kind === 'collection').map(([k, l, on]) => (
                <button key={k} aria-pressed={on} onClick={() => setPerm(k, !on)} style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, fontSize: 13.5, background: on ? 'var(--chip)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{on ? '✓ ' : ''}{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, padding: '2px 16px' }}>
            {kind === 'collection' && <Row title="Show guests" hint="What they can pick from"><Seg label="Show guests" options={['All candidates', 'Only the wall']} value={link.onlyWall ? 'Only the wall' : 'All candidates'} onPick={(v) => patch({ onlyWall: v === 'Only the wall' })} /></Row>}
            <Row title="Link expires"><Seg label="Link expires" options={EXPIRY.map((e) => e[0])} value={expiryLabel(link.expiresAt)} onPick={(v) => { const n = EXPIRY.find((e) => e[0] === v)![1]; patch({ expiresAt: n === null ? null : inDays(n) }); }} /></Row>
            <Row title="Ask for their name" hint="So you know whose ratings are whose"><Switch label="Ask for their name" on={link.askName} onClick={() => patch({ askName: !link.askName })} /></Row>
            <Row title="PIN" hint="Guests type these 4 digits to open the link." last>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {link.pin && <>
                  <input className="mono" inputMode="numeric" maxLength={4} aria-label="Link PIN" value={pinEdit} onChange={(e) => setPinEdit(e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => pinEdit.length === 4 && pinEdit !== link.pin && patch({ pin: pinEdit })}
                    style={{ width: 84, height: 32, borderRadius: 999, border: 0, outline: 'none', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', padding: '0 14px', fontWeight: 500, fontSize: 14, letterSpacing: '.25em', textAlign: 'center' }} />
                  <button style={{ fontSize: 12.5, color: 'var(--text2)' }} onClick={() => patch({ pin: true })}>New</button>
                  <button style={{ fontSize: 12.5, color: 'var(--text2)' }} onClick={() => copy(link.pin, 'pin')}>{copied === 'pin' ? 'Copied ✓' : 'Copy'}</button>
                </>}
                <Switch label="PIN" on={!!link.pin} onClick={() => patch({ pin: link.pin ? '' : true })} />
              </div>
            </Row>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">Send by email</span>
            {inv.data && !inv.data.canEmail ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>This server can’t send email, so copy the link instead.</p> : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="field-in" style={{ height: 40, borderRadius: 8 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="name@example.com" aria-label="Email address" />
                  <button className="btn outline" style={{ opacity: valid ? 1 : 0.4 }} onClick={send} disabled={!valid}>Send</button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(inv.data?.invites ?? []).filter((v, i, a) => a.findIndex((x) => x.email === v.email) === i).map((m) => (
                    <span key={m.email} style={{ height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 6px 0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 12.5 }}>
                      {m.email} <span className="faint" title={m.error}>{m.status === 'sent' ? 'Sent' : 'Failed'}</span>
                      <button aria-label={`Remove ${m.email}`} style={{ padding: '0 4px', color: 'var(--muted)' }} onClick={() => api(`/shares/${link.id}/invites?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }).then(inv.reload)}>✕</button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
