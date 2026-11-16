import { promptAction, confirmAction } from './dialogs';
import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';
import { newSharePin } from '../sharePin';
import { Sheet } from './Sheet';
import { usePhoneWidth } from '../usePhoneWidth';

type ShareLink = {
  id: number; token: string; label: string; versionId: number | null; allowDownload: boolean; allowReview: boolean; allowSuggest: boolean; onlyWall: boolean; askName: boolean; pin: string;
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
  <div className="share-setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: last ? 0 : '1px solid var(--hair)' }}>
    <div><div style={{ fontSize: 14 }}>{title}</div>{hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}</div>{children}
  </div>
);

/** Each address has its own permissions, expiry, PIN and invitations. */
export function SharePanel({ kind, id, name, onClose }: { kind: 'collection' | 'shoot'; id: number; name?: string; onClose: () => void }) {
  const links = useApi<ShareLink[]>(`/shares?kind=${kind}&id=${id}`);
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const link = selected === 'new' ? null : links.data?.find((item) => item.id === selected) ?? links.data?.find((item) => item.status === 'active') ?? links.data?.[0] ?? null;
  const update = (saved: ShareLink) => {
    links.set((previous) => [saved, ...(previous ?? []).filter((item) => item.id !== saved.id)].sort((a, b) => b.id - a.id));
    setSelected(saved.id);
  };
  const phone = usePhoneWidth();
  if (phone) return <ShareScreen kind={kind} id={id} name={name} onClose={onClose} links={links.data} error={links.error} link={link} selected={selected} setSelected={setSelected} busy={busy} update={update} onBusy={setBusy} />;
  return <Modal title={`Share ${name ?? (kind === 'shoot' ? 'this photoshoot' : 'this composition')}`} sub="Different links for different people. Each keeps its own settings." width={960} onClose={onClose}
    foot={<><span className="grow">Only the selected link is changed.</span><button className="btn primary" disabled={busy} onClick={onClose}>Done</button></>}>
    {!links.data ? <p role={links.error ? 'alert' : undefined} className="muted">{links.error || 'Loading…'}</p> : <div className="share-manager">
      <nav className="share-links" aria-label="Share links">
        <span className="eyebrow">Your links · {links.data.length}</span>
        {links.data.map((item) => <button key={item.id} disabled={busy} className={'share-link-item' + (link?.id === item.id ? ' selected' : '')} aria-pressed={link?.id === item.id} onClick={() => setSelected(item.id)}>
          <strong>{item.label || `Link ${item.id}`}</strong>
          <small>{[item.allowReview ? 'Rate' : 'View only', item.allowSuggest && kind === 'collection' ? 'Suggest' : '', item.allowDownload ? 'Download' : '', item.pin ? 'PIN' : ''].filter(Boolean).join(' · ')}</small>
          <small className="share-status">{item.status === 'active' ? '● Active' : item.status === 'revoked' ? 'Stopped' : 'Expired'}</small>
        </button>)}
        <button className="btn outline" disabled={busy} aria-pressed={!link} onClick={() => setSelected('new')}>+ New link</button>
      </nav>
      <ShareLinkEditor key={link?.id ?? 'new'} kind={kind} targetId={id} link={link} onSaved={update} onBusy={setBusy} />
    </div>}
  </Modal>;
}

/** The phone's share screen: a full page with a Back button, the links as rows, and the chosen link's settings below. */
function ShareScreen({ kind, id, name, onClose, links, error, link, selected, setSelected, busy, update, onBusy }: { kind: 'collection' | 'shoot'; id: number; name?: string; onClose: () => void; links: ShareLink[] | null; error: string | null; link: ShareLink | null; selected: number | 'new' | null; setSelected: (s: number | 'new' | null) => void; busy: boolean; update: (l: ShareLink) => void; onBusy: (b: boolean) => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-sheet], .modal')) onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  const mono11 = { font: '500 11px var(--mono)', letterSpacing: '.08em', color: 'var(--faint)' } as const;
  const shown = selected === 'new' ? null : link;
  return <div role="dialog" aria-label={`Share ${name ?? (kind === 'shoot' ? 'this photoshoot' : 'this composition')}`} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--page)', overflowY: 'auto', padding: '54px 20px 48px', boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 4 }}><button onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', fontSize: 13, color: 'var(--text2)' }}>← Back</button></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={mono11}>SHARE · {kind === 'shoot' ? 'PHOTOSHOOT' : 'COMPOSITION'}</span><h1 style={{ font: '400 38px/1.02 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{name ?? (kind === 'shoot' ? 'This photoshoot' : 'This composition')}</h1></div>
      {!links ? <p role={error ? 'alert' : undefined} className="muted">{error || 'Loading…'}</p> : <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={mono11}>LINKS</span><button disabled={busy} onClick={() => setSelected('new')} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>+ New link</button></div>
          {links.map((item) => { const on = shown?.id === item.id; return (
            <button key={item.id} disabled={busy} aria-pressed={on} onClick={() => setSelected(item.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 14px', borderRadius: 12, background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px var(--outline)' : 'inset 0 0 0 1px var(--hair)', textAlign: 'left' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{item.label || `Link ${item.id}`}</span><span style={{ fontSize: 12.5, color: item.status === 'active' ? 'var(--ok)' : 'var(--faint)' }}>{item.status === 'active' ? `Active · ${item.expiresAt ? `expires ${new Date(item.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : 'never expires'}` : item.status === 'revoked' ? 'Stopped' : 'Expired'}</span></span>
              <span style={{ color: 'var(--faint)' }}>›</span>
            </button>); })}
          {links.length === 0 && selected !== 'new' && <div style={{ padding: '16px 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>No links yet. Create one for family, a framer or a friend.</div>}
        </div>
        <ShareLinkEditor key={shown?.id ?? 'new'} kind={kind} targetId={id} link={shown} onSaved={update} onBusy={onBusy} phone startNew={selected === 'new'} onCancelNew={() => setSelected(null)} />
      </>}
    </div>
  </div>;
}

function ShareLinkEditor({ kind, targetId, link, onSaved, onBusy, phone, startNew, onCancelNew }: { kind: 'collection' | 'shoot'; targetId: number; link: ShareLink | null; onSaved: (link: ShareLink) => void; onBusy: (busy: boolean) => void; phone?: boolean; startNew?: boolean; onCancelNew?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [fresh, setFresh] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const versions = useApi<{ id: number; name: string }[]>(kind === 'collection' ? `/collections/${targetId}/versions` : null);
  const [draft, setDraft] = useState({ versionId: null as number | null, label: '', allowReview: true, allowSuggest: true, allowDownload: false, onlyWall: false, askName: true, pin: '', expiresAt: inDays(21) as string | null });
  const [pinEdit, setPinEdit] = useState('');
  const inv = useApi<{ invites: Invite[]; canEmail: boolean }>(link ? `/shares/${link.id}/invites` : null);
  useEffect(() => setPinEdit(link?.pin ?? draft.pin), [link?.pin, draft.pin]);
  const run = async (fn: () => Promise<ShareLink>) => { if (busy) return; setBusy(true); onBusy(true); setErr(''); try { onSaved(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); } };
  const settings = link ?? draft;
  const start = () => run(() => api<ShareLink>('/shares', { body: { kind, id: targetId, ...draft, allowSuggest: kind === 'collection' && draft.allowSuggest } }));
  const patch = (body: Partial<typeof draft>) => link ? run(() => api(`/shares/${link.id}`, { method: 'PATCH', body })) : setDraft((d) => ({ ...d, ...body }));
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); } catch { if (await promptAction('Copy this', text) === null) return; } setCopied(key); setTimeout(() => setCopied(''), 1800); };
  const stop = async () => link && (await confirmAction(`Stop sharing through ${link.label || `Link ${link.id}`}? Other links will keep working.`)) && run(() => api(`/shares/${link.id}`, { method: 'DELETE' }));
  const regen = async () => link && (await confirmAction('Replace this link’s address? Its old address will stop working. Other links are unchanged.')) && run(async () => { const saved = await api<ShareLink>(`/shares/${link.id}/regenerate`, { body: {} }); setFresh(true); return saved; });
  const send = async () => {
    if (!link || link.status !== 'active' || busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    setBusy(true); onBusy(true);
    try { await api(`/shares/${link.id}/invites`, { body: { emails: [email.trim()] } }); setEmail(''); inv.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); }
  };
  const perms: [string, string, boolean][] = [['rate', 'Rate photos', settings.allowReview], ['suggest', 'Suggest changes', settings.allowSuggest], ['dl', 'Download files', settings.allowDownload]];
  const setPerm = (k: string, v: boolean) => patch(k === 'rate' ? { allowReview: v } : k === 'suggest' ? { allowSuggest: v } : { allowDownload: v });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const [sheet, setSheet] = useState<null | 'invite' | 'rename' | 'new'>(phone && startNew && !link ? 'new' : null);
  const [nameDraft, setNameDraft] = useState('');
  if (phone) {
    const stopped = !!link && link.status !== 'active';
    type Tog = [string, string, string, boolean, () => void];
    const toggles: Tog[] = [
      ['rate', 'Guests can rate', 'Ratings show up in your notifications', settings.allowReview, () => setPerm('rate', !settings.allowReview)],
      ...(kind === 'collection' ? [
        ['suggest', 'Guests can suggest photos', 'Suggest a different photo for a print', settings.allowSuggest, () => setPerm('suggest', !settings.allowSuggest)] as Tog,
        ['wall', 'Only show the wall', 'Hide the other candidates', settings.onlyWall, () => patch({ onlyWall: !settings.onlyWall })] as Tog,
      ] : []),
      ['dl', 'Allow downloads', 'Full-size files', settings.allowDownload, () => setPerm('dl', !settings.allowDownload)],
      ['name', 'Ask for their name', 'So you know whose ratings are whose', settings.askName, () => patch({ askName: !settings.askName })],
      ['pin', 'Require a PIN', settings.pin ? `PIN ${settings.pin} · share it separately` : 'A 4-digit PIN is asked before viewing', !!settings.pin, () => patch({ pin: settings.pin ? '' : newSharePin() })],
    ];
    const sent = (inv.data?.invites ?? []).filter((v, i, a) => a.findIndex((x) => x.email === v.email) === i);
    const pill = { height: 40, padding: '0 14px', borderRadius: 999, fontSize: 13, boxShadow: 'inset 0 0 0 1px var(--outline)' } as const;
    const inputStyle = { height: 50, border: 0, outline: 'none', borderRadius: 12, padding: '0 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 16 } as const;
    const cta = (on = true) => ({ height: 46, padding: '0 22px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14.5, opacity: on ? 1 : 0.4 }) as const;
    const ghost = { height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' } as const;
    const closeNew = () => { setSheet(null); onCancelNew?.(); };
    return <>
      {sheet === 'new' && <Sheet title="New link" sub="Name it so you recognise it later. Each link keeps its own permissions, PIN and expiry." onClose={closeNew}>
        <input autoFocus aria-label="Link name" maxLength={80} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="e.g. Family, Framer quote" style={inputStyle}
          onKeyDown={(e) => { if (e.key === 'Enter' && nameDraft.trim()) (e.currentTarget.parentElement?.querySelector('[data-create]') as HTMLButtonElement | null)?.click(); }} />
        {err && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={closeNew} style={ghost}>Cancel</button>
          <button data-create disabled={busy || !nameDraft.trim()} onClick={() => void run(() => api<ShareLink>('/shares', { body: { kind, id: targetId, ...draft, label: nameDraft.trim(), allowSuggest: kind === 'collection' && draft.allowSuggest } }))} style={cta(!!nameDraft.trim())}>Create link</button>
        </div>
      </Sheet>}
      {sheet === 'rename' && link && <Sheet title="Rename link" onClose={() => setSheet(null)}>
        <input autoFocus aria-label="Link name" maxLength={80} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="e.g. Client review" style={inputStyle} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setSheet(null)} style={ghost}>Cancel</button>
          <button onClick={() => { void patch({ label: nameDraft.trim() }); setSheet(null); }} style={cta()}>Save</button>
        </div>
      </Sheet>}
      {sheet === 'invite' && link && <Sheet title="Invitations" sub={inv.data && !inv.data.canEmail ? 'This server can’t send email, so copy the link instead.' : 'They get the link by email. Remove one to take it off the list.'} onClose={() => setSheet(null)}>
        {!(inv.data && !inv.data.canEmail) && <>
          <input autoFocus type="email" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="name@example.com" style={inputStyle} />
          {err && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setSheet(null)} style={ghost}>Done</button>
            <button disabled={!valid || busy || link.status !== 'active'} onClick={send} style={cta(valid && link.status === 'active')}>Send invite</button>
          </div>
          {sent.map((m) => <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, borderTop: '1px solid var(--hair)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, overflowWrap: 'anywhere' }}>{m.email}</span><span title={m.error} style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{m.status === 'sent' ? 'Sent' : 'Failed'}</span>
            <button aria-label={`Remove ${m.email}`} onClick={async () => { setBusy(true); onBusy(true); setErr(''); try { await api(`/shares/${link.id}/invites?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); inv.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); } }} style={{ width: 40, height: 40, color: 'var(--muted)' }}>✕</button>
          </div>)}
        </>}
      </Sheet>}
      {link && <div style={{ display: 'flex', flexDirection: 'column', padding: 16, borderRadius: 14, background: 'var(--surface)' }}>
        <span style={{ font: '500 11px var(--mono)', letterSpacing: '.08em', color: 'var(--faint)', overflowWrap: 'anywhere' }}>SETTINGS · {(link.label || `Link ${link.id}`).toUpperCase()}</span>
        {err && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
        {stopped && <span style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45, color: 'var(--text2)' }}>This link is {link.status === 'revoked' ? 'stopped' : 'expired'}. Anyone who opens it sees a message instead of your work.</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 5px 0 14px', borderRadius: 999, background: 'var(--page)', margin: '12px 0 6px' }}>
          <span style={{ flex: 1, minWidth: 0, font: '400 12.5px var(--mono)', color: stopped ? 'var(--faint)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{urlOf(link.token).replace(/^https?:\/\//, '')}</span>
          <button onClick={() => copy(urlOf(link.token), 'link')} style={{ height: 34, padding: '0 14px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13, fontWeight: 500 }}>{copied === 'link' ? 'Copied ✓' : 'Copy'}</button>
        </div>
        {kind === 'collection' && Array.isArray(versions.data) && versions.data.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Arrangement</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Saved ones stay fixed when you edit the wall.</span></span>
          <select aria-label="Shared arrangement" value={settings.versionId ?? ''} onChange={(e) => patch({ versionId: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: 130, height: 36, borderRadius: 999, border: 0, background: 'var(--page)', color: 'var(--text)', padding: '0 10px', fontSize: 13 }}><option value="">Live editor</option>{versions.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </label>}
        {toggles.map(([k, label, sub, on, flip]) => (
          <button key={k} role="switch" aria-checked={on} disabled={busy} onClick={flip} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>{label}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></span>
            <span style={{ position: 'relative', flex: 'none', width: 48, height: 28, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'var(--chip)' }}><i style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--btn-fg)' : 'var(--text2)' }} /></span>
          </button>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderTop: '1px solid var(--hair)' }}>
          <span style={{ fontSize: 15 }}>Expires</span>
          <div role="group" aria-label="Link expires" style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--page)' }}>
            {EXPIRY.map(([l, n]) => { const on = expiryLabel(settings.expiresAt) === l; return <button key={l} aria-pressed={on} disabled={busy} onClick={() => patch({ expiresAt: n === null ? null : inDays(n) })} style={{ flex: 1, height: 36, borderRadius: 999, background: on ? 'var(--raised2)' : 'transparent', color: on ? 'var(--text)' : 'var(--text2)', fontSize: 12.5, fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>{l}</button>; })}
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{settings.expiresAt ? `Expires ${new Date(settings.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : 'Never expires'}{fresh ? ' · New address made, the old one stops working' : ''}</span>
        </div>
        <button onClick={() => { setErr(''); setSheet('invite'); }} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Invitations</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sent.length ? `${sent.length} invited` : 'No one invited yet'}</span></span>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Invite ›</span>
        </button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--hair)' }}>
          {!stopped && <a href={urlOf(link.token)} target="_blank" rel="noopener noreferrer" style={{ ...pill, display: 'inline-flex', alignItems: 'center', color: 'var(--text)', textDecoration: 'none' }}>Preview as guest</a>}
          <button onClick={() => { setNameDraft(link.label); setSheet('rename'); }} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--text2)' }}>Rename</button>
          <button disabled={stopped} onClick={regen} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--text2)', opacity: stopped ? 0.4 : 1 }}>Replace address</button>
          {stopped
            ? <button onClick={() => void run(() => api(`/shares/${link.id}`, { method: 'PATCH', body: { on: true, ...(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? { expiresAt: inDays(21) } : {}) } }))} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--text)' }}>Restart link</button>
            : <button onClick={stop} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--danger)' }}>Stop this link</button>}
        </div>
      </div>}
    </>;
  }

  return <div className="share-editor">
    <div className="spread"><h2 className="serif">{link ? link.label || `Link ${link.id}` : 'New link'}</h2><span className="muted">{link ? link.status === 'active' ? '● Active' : link.status === 'revoked' ? 'Stopped' : 'Expired' : 'Not shared yet'}</span></div>
    {err && <div className="reason" role="alert">{err}</div>}
    <fieldset disabled={busy} className="share-fields">
      <label className="share-name">Link name<input className="field-in" aria-label="Link name" maxLength={80} placeholder="e.g. Client review" defaultValue={link?.label ?? draft.label} onChange={(event) => { if (!link) setDraft((value) => ({ ...value, label: event.target.value })); }} onBlur={(event) => { if (link && event.target.value !== link.label) void patch({ label: event.target.value }); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
      {kind === 'collection' && <label>Arrangement<select className="field-in" aria-label="Shared arrangement" value={settings.versionId ?? ''} onChange={event => patch({ versionId: event.target.value ? Number(event.target.value) : null })}><option value="">Live editor</option>{(Array.isArray(versions.data) ? versions.data : []).map(version => <option key={version.id} value={version.id}>{version.name}</option>)}</select><small className="muted">Saved arrangements stay fixed when you edit the wall.</small>{versions.error && <p role="alert">{versions.error}</p>}</label>}
      {link && link.status !== 'active' && <div className="share-inactive"><p className="muted">This link is {link.status === 'revoked' ? 'stopped' : 'expired'}. Its address cannot be opened by guests.{link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? ' Reactivating sets a new expiry in 3 weeks.' : ''}</p><button className="btn outline" onClick={() => void run(() => api(`/shares/${link.id}`, { method: 'PATCH', body: { on: true, ...(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? { expiresAt: inDays(21) } : {}) } }))}>Reactivate this link</button></div>}
          {link && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="mono" style={{ flex: 1, height: 42, borderRadius: 8, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', transition: 'background .3s', background: fresh ? 'var(--chip)' : 'var(--bg)' }}>{urlOf(link.token).replace(/^https?:\/\//, '')}</span>
                <button className="btn primary" style={{ height: 42, flex: 'none' }} onClick={() => copy(urlOf(link.token), 'link')}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
                <a className={'btn outline' + (link.status === 'active' ? '' : ' disabled')} style={{ height: 42, flex: 'none' }} aria-disabled={link.status !== 'active'} href={link.status === 'active' ? urlOf(link.token) : undefined} target="_blank" rel="noopener noreferrer">Preview as guest</a>
              </div>
              <div className="spread" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                <span>{settings.expiresAt ? `Expires ${new Date(settings.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : 'Never expires'}{settings.pin ? ' · PIN on' : ''}{fresh ? ' · New link made, the old one stops working' : ''}</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">Guests can</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {perms.filter(([k]) => k !== 'suggest' || kind === 'collection').map(([k, l, on]) => (
                <button key={k} aria-pressed={on} onClick={() => setPerm(k, !on)} style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, fontSize: 13.5, background: on ? 'var(--chip)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{on ? '✓ ' : ''}{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, padding: '2px 16px' }}>
            {kind === 'collection' && <Row title="Show guests" hint="What they can pick from"><Seg label="Show guests" options={['All candidates', 'Only the wall']} value={settings.onlyWall ? 'Only the wall' : 'All candidates'} onPick={(v) => patch({ onlyWall: v === 'Only the wall' })} /></Row>}
            <Row title="Link expires"><Seg label="Link expires" options={EXPIRY.map((e) => e[0])} value={expiryLabel(settings.expiresAt)} onPick={(v) => { const n = EXPIRY.find((e) => e[0] === v)![1]; patch({ expiresAt: n === null ? null : inDays(n) }); }} /></Row>
            <Row title="Ask for their name" hint="So you know whose ratings are whose"><Switch label="Ask for their name" on={settings.askName} onClick={() => patch({ askName: !settings.askName })} /></Row>
            <Row title="PIN" hint="Guests type these 4 digits to open the link." last>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {settings.pin && <>
                  <input className="mono" inputMode="numeric" maxLength={4} aria-label="Link PIN" value={pinEdit} onChange={(e) => setPinEdit(e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => pinEdit.length === 4 && pinEdit !== settings.pin && patch({ pin: pinEdit })}
                    style={{ width: 84, height: 32, borderRadius: 999, border: 0, outline: 'none', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', padding: '0 14px', fontWeight: 500, fontSize: 14, letterSpacing: '.25em', textAlign: 'center' }} />
                  <button style={{ fontSize: 12.5, color: 'var(--text2)' }} onClick={() => patch({ pin: newSharePin() })}>New</button>
                  <button style={{ fontSize: 12.5, color: 'var(--text2)' }} onClick={() => copy(settings.pin, 'pin')}>{copied === 'pin' ? 'Copied ✓' : 'Copy'}</button>
                </>}
                <Switch label="PIN" on={!!settings.pin} onClick={() => patch({ pin: settings.pin ? '' : newSharePin() })} />
              </div>
            </Row>
          </div>
          {link?.status === 'active' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <button aria-label={`Remove ${m.email}`} style={{ padding: '0 4px', color: 'var(--muted)' }} onClick={async () => { setBusy(true); onBusy(true); setErr(''); try { await api(`/shares/${link.id}/invites?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); inv.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); } }}>✕</button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>}
      <div className="share-editor-actions">
        {link ? <><button className="btn outline" disabled={link.status !== 'active'} onClick={regen}>Replace address…</button><button className="share-stop" disabled={link.status !== 'active'} onClick={stop}>Stop this link</button></> : <button className="btn primary" onClick={start}>Create link</button>}
      </div>
    </fieldset>
  </div>;
}
