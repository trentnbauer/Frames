import { promptAction, confirmAction } from './dialogs';
import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';
import { newSharePin } from '../sharePin';
import { Sheet } from './Sheet';
import { createPortal } from 'react-dom';
import { usePhoneWidth } from '../usePhoneWidth';

export type ShareKind = 'collection' | 'shoot' | 'photo';
const KIND_NAME: Record<ShareKind, string> = { collection: 'composition', shoot: 'photoshoot', photo: 'photograph' };
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
export function SharePanel({ kind, id, name, onClose }: { kind: ShareKind; id: number; name?: string; onClose: () => void }) {
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
  const title = name ?? `this ${KIND_NAME[kind]}`;
  const rel = (item: ShareLink) => item.status === 'active' ? `Active · ${item.expiresAt ? `expires in ${Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86_400_000))} days` : 'never expires'}${item.pin ? ' · PIN' : ''}` : item.status === 'revoked' ? 'Stopped' : 'Expired';
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [newErr, setNewErr] = useState('');
  const newLink = async () => {
    if (busy) return; setBusy(true); setNewErr('');
    try { update(await api<ShareLink>('/shares', { body: { kind, id, label: `Link ${(links.data?.length ?? 0) + 1}`, allowReview: true, allowSuggest: kind === 'collection', allowDownload: false, onlyWall: false, askName: true, pin: '', versionId: null, expiresAt: inDays(21) } })); }
    catch (e) { setNewErr((e as Error).message); } finally { setBusy(false); }
  };
  return <Modal title={`Share “${title}”`} sub="Each link has its own permissions, PIN and expiry. Guests never see your other shoots and compositions." width={600} onClose={onClose}
    foot={<><span ref={setSlot} style={{ display: 'contents' }} /><button className="btn primary" disabled={busy} onClick={onClose}>Done</button></>}>
    {!links.data ? <p role={links.error ? 'alert' : undefined} className="muted">{links.error || 'Loading…'}</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ font: "500 10.5px/1 'IBM Plex Mono',monospace", letterSpacing: '.08em', color: 'var(--faint)' }}>LINKS</span><button disabled={busy} onClick={newLink} style={{ fontSize: 13, color: 'var(--text2)' }}>+ New link</button></div>
        {links.data.map((item) => { const on = link?.id === item.id; return (
          <button key={item.id} disabled={busy} aria-pressed={on} onClick={() => setSelected(item.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: on ? 'var(--bg)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px var(--outline)' : 'inset 0 0 0 1px var(--hair)', textAlign: 'left' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{item.label || `Link ${item.id}`}</span><span style={{ fontSize: 12.5, color: item.status === 'active' ? 'var(--ok)' : 'var(--faint)' }}>{rel(item)}</span></span>
            <span style={{ font: "400 12px 'IBM Plex Mono',monospace", color: 'var(--faint)', whiteSpace: 'nowrap' }}>{urlOf(item.token).replace(/^https?:\/\//, '').replace(/^(.{14}).*$/, '$1…')}</span>
          </button>); })}
        {links.data.length === 0 && <div style={{ padding: '12px 0', fontSize: 13.5, color: 'var(--muted)' }}>No links yet. Create one for family, a client or a friend.</div>}
        {newErr && <div role="alert" className="reason">{newErr}</div>}
      </div>
      <ShareLinkEditor key={link?.id ?? 'none'} kind={kind} targetId={id} link={link} onSaved={update} onBusy={setBusy} desk footSlot={slot} />
    </div>}
  </Modal>;
}

/** The phone's share screen: a full page with a Back button, the links as rows, and the chosen link's settings below. */
function ShareScreen({ kind, id, name, onClose, links, error, link, selected, setSelected, busy, update, onBusy }: { kind: ShareKind; id: number; name?: string; onClose: () => void; links: ShareLink[] | null; error: string | null; link: ShareLink | null; selected: number | 'new' | null; setSelected: (s: number | 'new' | null) => void; busy: boolean; update: (l: ShareLink) => void; onBusy: (b: boolean) => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-sheet], .modal')) onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  const mono11 = { font: '500 11px var(--mono)', letterSpacing: '.08em', color: 'var(--faint)' } as const;
  const shown = selected === 'new' ? null : link;
  return <div role="dialog" aria-label={`Share ${name ?? `this ${KIND_NAME[kind]}`}`} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--page)', overflowY: 'auto', padding: '54px 20px 48px', boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 4 }}><button onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', fontSize: 13, color: 'var(--text2)' }}>← Back</button></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={mono11}>SHARE · {KIND_NAME[kind].toUpperCase()}</span><h1 style={{ font: '400 38px/1.02 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{name ?? (kind === 'shoot' ? 'This photoshoot' : 'This composition')}</h1></div>
      {!links ? <p role={error ? 'alert' : undefined} className="muted">{error || 'Loading…'}</p> : <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={mono11}>LINKS</span><button disabled={busy} onClick={() => setSelected('new')} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>+ New link</button></div>
          {links.map((item) => { const on = shown?.id === item.id; return (
            <button key={item.id} disabled={busy} aria-pressed={on} onClick={() => setSelected(item.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 14px', borderRadius: 12, background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px var(--outline)' : 'inset 0 0 0 1px var(--hair)', textAlign: 'left' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{item.label || `Link ${item.id}`}</span><span style={{ fontSize: 12.5, color: item.status === 'active' ? 'var(--ok)' : 'var(--faint)' }}>{item.status === 'active' ? `Active · ${item.expiresAt ? `expires in ${Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86_400_000))} days` : 'never expires'}` : item.status === 'revoked' ? 'Stopped' : 'Expired'}</span></span>
              <span style={{ color: 'var(--faint)' }}>›</span>
            </button>); })}
          {links.length === 0 && selected !== 'new' && <div style={{ padding: '16px 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>No links yet. Create one for family, a framer or a friend.</div>}
        </div>
        <ShareLinkEditor key={shown?.id ?? 'new'} kind={kind} targetId={id} link={shown} onSaved={update} onBusy={onBusy} phone startNew={selected === 'new'} onCancelNew={() => setSelected(null)} />
      </>}
    </div>
  </div>;
}

function ShareLinkEditor({ kind, targetId, link, onSaved, onBusy, phone, startNew, onCancelNew, desk, footSlot }: { kind: ShareKind; targetId: number; link: ShareLink | null; onSaved: (link: ShareLink) => void; onBusy: (busy: boolean) => void; phone?: boolean; startNew?: boolean; onCancelNew?: () => void; desk?: boolean; footSlot?: HTMLElement | null }) {
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
  const stop = async () => link && (await confirmAction(`Delete ${link.label || `Link ${link.id}`}? Anyone with this address loses access for good, and the comments and ratings guests left on it are deleted. Other links will keep working.`)) && run(() => api(`/shares/${link.id}`, { method: 'DELETE' }));
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
  const [more, setMore] = useState(false);
  if (phone) {
    const stopped = !!link && link.status !== 'active';
    type Tog = [string, string, string, boolean, () => void];
    const toggles: Tog[] = [
      ['rate', 'Guests can rate', 'Ratings show up in your notifications', settings.allowReview, () => setPerm('rate', !settings.allowReview)],
      ...(kind === 'collection' ? [['suggest', 'Guests can suggest photos', 'Suggest a different photo for a print', settings.allowSuggest, () => setPerm('suggest', !settings.allowSuggest)] as Tog] : []),
      ['dl', 'Allow downloads', 'Full-size files', settings.allowDownload, () => setPerm('dl', !settings.allowDownload)],
      ['pin', 'Require a PIN', settings.pin ? `PIN ${settings.pin} · share it separately` : 'A 4-digit PIN is asked before viewing', !!settings.pin, () => patch({ pin: settings.pin ? '' : newSharePin() })],
    ];
    // Less common settings, kept out of the way under "More options" so the card reads like the design.
    const extras: Tog[] = [
      ...(kind === 'collection' ? [['wall', 'Only show the wall', 'Hide the other candidates', settings.onlyWall, () => patch({ onlyWall: !settings.onlyWall })] as Tog] : []),
      ['name', 'Ask for their name', 'So you know whose ratings are whose', settings.askName, () => patch({ askName: !settings.askName })],
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
        {toggles.map(([k, label, sub, on, flip]) => (
          <button key={k} role="switch" aria-checked={on} disabled={busy} onClick={flip} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>{label}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></span>
            <span style={{ position: 'relative', flexShrink: 0, width: 48, height: 28, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'var(--chip)' }}><i style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--btn-fg)' : 'var(--text2)' }} /></span>
          </button>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderTop: '1px solid var(--hair)' }}>
          <span style={{ fontSize: 15 }}>Expires</span>
          <div role="group" aria-label="Link expires" style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--page)' }}>
            {EXPIRY.map(([l, n]) => { const on = expiryLabel(settings.expiresAt) === l; return <button key={l} aria-pressed={on} disabled={busy} onClick={() => patch({ expiresAt: n === null ? null : inDays(n) })} style={{ flex: 1, height: 36, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'transparent', color: on ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 12.5, fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>{l}</button>; })}
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{settings.expiresAt ? `Expires in ${Math.max(0, Math.ceil((new Date(settings.expiresAt).getTime() - Date.now()) / 86_400_000))} days` : 'Never expires'}{fresh ? ' · New address made, the old one stops working' : ''}</span>
        </div>
        <button onClick={() => { setErr(''); setSheet('invite'); }} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Invitations</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sent.length ? `${sent.length} invited` : 'No one invited yet'}</span></span>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Invite ›</span>
        </button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--hair)' }}>
          {!stopped && <a href={urlOf(link.token)} target="_blank" rel="noopener noreferrer" style={{ ...pill, display: 'inline-flex', alignItems: 'center', color: 'var(--text)', textDecoration: 'none' }}>Preview as guest</a>}
          <button disabled={stopped} onClick={regen} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--text2)', opacity: stopped ? 0.4 : 1 }}>Replace address</button>
          {stopped
            ? <button onClick={() => void run(() => api(`/shares/${link.id}`, { method: 'PATCH', body: { on: true, ...(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? { expiresAt: inDays(21) } : {}) } }))} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--text)' }}>Restart link</button>
            : null}
          <button onClick={stop} style={{ height: 40, padding: '0 10px', fontSize: 13, color: 'var(--danger)' }}>Delete link</button>
        </div>
        <button aria-expanded={more} onClick={() => setMore(!more)} style={{ alignSelf: 'flex-start', minHeight: 44, marginTop: 4, fontSize: 13, color: 'var(--text2)' }}>{more ? 'Fewer options ⌃' : 'More options ⌄'}</button>
        {more && <div style={{ display: 'flex', flexDirection: 'column' }}>
        {kind === 'collection' && Array.isArray(versions.data) && versions.data.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Arrangement</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Saved ones stay fixed when you edit the wall.</span></span>
          <select aria-label="Shared arrangement" value={settings.versionId ?? ''} onChange={(e) => patch({ versionId: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: 130, height: 36, borderRadius: 999, border: 0, background: 'var(--page)', color: 'var(--text)', padding: '0 10px', fontSize: 13 }}><option value="">Live editor</option>{versions.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </label>}
          {extras.map(([k, label, sub, on, flip]) => (
            <button key={k} role="switch" aria-checked={on} disabled={busy} onClick={flip} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>{label}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></span>
              <span style={{ position: 'relative', flexShrink: 0, width: 48, height: 28, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'var(--chip)' }}><i style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--btn-fg)' : 'var(--text2)' }} /></span>
            </button>
          ))}
          <button onClick={() => { setNameDraft(link.label); setSheet('rename'); }} style={{ display: 'flex', alignItems: 'center', minHeight: 56, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}><span style={{ flex: 1, fontSize: 15 }}>Rename link</span><span style={{ color: 'var(--faint)' }}>›</span></button>
        </div>}
      </div>}
    </>;
  }

  if (!link) return null;
  const stopped = link.status !== 'active';
  type T = [string, string, string, boolean, () => void];
  const toggles: T[] = [
    ['rate', 'Guests can rate', 'Ratings come back to you in notifications', settings.allowReview, () => setPerm('rate', !settings.allowReview)],
    ...(kind === 'collection' ? [['suggest', 'Guests can suggest photos', 'Suggest a different photo for a print', settings.allowSuggest, () => setPerm('suggest', !settings.allowSuggest)] as T] : []),
    ['dl', 'Allow downloads', 'Full-size originals, one at a time or all at once', settings.allowDownload, () => setPerm('dl', !settings.allowDownload)],
    ['pin', 'Require a PIN', settings.pin ? `PIN ${settings.pin} · share it separately` : 'A 4-digit PIN is asked before viewing', !!settings.pin, () => patch({ pin: settings.pin ? '' : newSharePin() })],
  ];
  const extras: T[] = [
    ...(kind === 'collection' ? [['wall', 'Only show the wall', 'Hide the other candidates', settings.onlyWall, () => patch({ onlyWall: !settings.onlyWall })] as T] : []),
    ['name', 'Ask for their name', 'So you know whose ratings are whose', settings.askName, () => patch({ askName: !settings.askName })],
  ];
  const sentTo = (inv.data?.invites ?? []).filter((v, i, a) => a.findIndex((x) => x.email === v.email) === i);
  const sw = (on: boolean) => <span style={{ position: 'relative', flexShrink: 0, width: 40, height: 22, borderRadius: 999, background: on ? 'var(--text)' : 'var(--outline)' }}><i style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: on ? 'var(--bg)' : 'var(--text2)', transition: 'left .15s' }} /></span>;
  const row = ([k, label, sub, on, flip]: T) => (
    <button key={k} role="switch" aria-checked={on} disabled={busy} onClick={flip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>{label}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></span>{sw(on)}
    </button>
  );
  const field = { height: 44, border: 0, outline: 'none', borderRadius: 10, padding: '0 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 15 } as const;
  const foot = (
    <>
{stopped && <button disabled={busy} onClick={() => void run(() => api(`/shares/${link.id}`, { method: 'PATCH', body: { on: true, ...(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? { expiresAt: inDays(21) } : {}) } }))} style={{ fontSize: 13, color: 'var(--text)' }}>Restart link</button>}
      <button disabled={busy} onClick={stop} style={{ fontSize: 13, color: 'var(--danger)' }}>Delete link</button>
      <span className="grow" />
      <a className={'btn outline' + (stopped ? ' disabled' : '')} aria-disabled={stopped} href={stopped ? undefined : urlOf(link.token)} target="_blank" rel="noopener noreferrer">Preview as guest</a>
    </>
  );
  return <>
    {err && <div className="reason" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRadius: 12, padding: '6px 16px' }}>
      {stopped && <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>This link is {link.status === 'revoked' ? 'stopped' : 'expired'}. Anyone who opens it sees a message instead of your work.</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
        <code style={{ flex: 1, font: "400 12.5px 'IBM Plex Mono',monospace", color: stopped ? 'var(--faint)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: fresh ? 'var(--chip)' : undefined }}>{urlOf(link.token).replace(/^https?:\/\//, '')}</code>
        <button onClick={() => copy(urlOf(link.token), 'link')} style={{ fontSize: 12.5, color: 'var(--text2)' }}>{copied === 'link' ? 'Copied ✓' : 'Copy'}</button>
      </div>
      {toggles.map(row)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--hair)' }}>
        <span style={{ fontSize: 14 }}>Expires</span>
        <div role="group" aria-label="Link expires" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 999, background: 'var(--surface)' }}>
          {EXPIRY.map(([l, n]) => { const on = expiryLabel(settings.expiresAt) === l; return <button key={l} aria-pressed={on} disabled={busy} onClick={() => patch({ expiresAt: n === null ? null : inDays(n) })} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 13, background: on ? 'var(--btn-bg)' : 'transparent', color: on ? 'var(--btn-fg)' : 'var(--text2)', fontWeight: on ? 500 : 400 }}>{l}</button>; })}
        </div>
      </div>
      <button onClick={() => { setErr(''); setSheet('invite'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>Invitations</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sentTo.length ? `${sentTo.length} invited` : 'No one invited yet'}</span></span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>Invite ›</span>
      </button>
      <button aria-expanded={more} onClick={() => setMore(!more)} style={{ alignSelf: 'flex-start', minHeight: 40, fontSize: 13, color: 'var(--text2)', borderTop: '1px solid var(--hair)', width: '100%', textAlign: 'left' }}>{more ? 'Fewer options ⌃' : 'More options ⌄'}</button>
      {more && <div style={{ display: 'flex', flexDirection: 'column' }}>
        {kind === 'collection' && <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--hair)' }}><span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>Arrangement</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Saved arrangements stay fixed when you edit the wall.</span></span><select aria-label="Shared arrangement" value={settings.versionId ?? ''} onChange={(e) => patch({ versionId: e.target.value ? Number(e.target.value) : null })} className="field-in" style={{ width: 160 }}><option value="">Live editor</option>{(Array.isArray(versions.data) ? versions.data : []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
        {extras.map(row)}
        <button onClick={() => { setNameDraft(link.label); setSheet('rename'); }} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--hair)', fontSize: 14, textAlign: 'left', width: '100%' }}><span>Rename link</span><span style={{ color: 'var(--faint)' }}>›</span></button>
        <button disabled={stopped} onClick={regen} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--hair)', fontSize: 14, textAlign: 'left', width: '100%', opacity: stopped ? 0.4 : 1 }}><span>Replace address…</span><span style={{ color: 'var(--faint)' }}>›</span></button>
      </div>}
    </div>
    {footSlot && createPortal(foot, footSlot)}
    {sheet === 'rename' && <Modal title="Rename link" width={480} onClose={() => setSheet(null)} foot={<><span className="grow" /><button className="btn" onClick={() => setSheet(null)}>Cancel</button><button className="btn primary" onClick={() => { void patch({ label: nameDraft.trim() }); setSheet(null); }}>Save</button></>}>
      <input autoFocus aria-label="Link name" maxLength={80} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void patch({ label: nameDraft.trim() }); setSheet(null); } }} placeholder="e.g. Client review" style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
    </Modal>}
    {sheet === 'invite' && <Modal title="Invitations" sub={inv.data && !inv.data.canEmail ? 'This server can’t send email, so copy the link instead.' : 'They get the link by email. Remove one to take it off the list.'} width={480} onClose={() => setSheet(null)} foot={<><span className="grow" /><button className="btn" onClick={() => setSheet(null)}>Done</button>{!(inv.data && !inv.data.canEmail) && <button className="btn primary" disabled={!valid || busy || stopped} onClick={send}>Send invite</button>}</>}>
      {!(inv.data && !inv.data.canEmail) && <>
        <input autoFocus type="email" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="name@example.com" style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
        {sentTo.map((m) => <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, borderTop: '1px solid var(--hair)', marginTop: 8 }}><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{m.email}</span><span title={m.error} className="faint" style={{ fontSize: 12 }}>{m.status === 'sent' ? 'Sent' : 'Failed'}</span><button aria-label={`Remove ${m.email}`} style={{ color: 'var(--muted)' }} onClick={async () => { setBusy(true); onBusy(true); setErr(''); try { await api(`/shares/${link.id}/invites?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); inv.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); } }}>✕</button></div>)}
      </>}
    </Modal>}
  </>;
}
