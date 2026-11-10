import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';

type ShareLink = {
  id: number; token: string; label: string; allowDownload: boolean; allowReview: boolean; allowSuggest: boolean; seeEachOther: boolean; showGuests: boolean; askName: boolean; pin: string;
  expiresAt: string | null; status: 'active' | 'expired' | 'revoked'; views: number; downloads: number; reviews: number;
};
type Invite = { email: string; status: 'sent' | 'failed'; error: string; at: string };

const urlOf = (t: string) => `${window.location.origin}/s/${t}`;
const Sw = ({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) => <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'sw' + (on ? ' on' : '')} onClick={onClick} />;
const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="toggle" style={{ padding: '11px 0', borderTop: '1px solid var(--hair)' }}><div><div style={{ fontSize: 14 }}>{title}</div>{hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}</div>{children}</div>
);

/**
 * Share for review: the one link for a composition or photoshoot. On or off, permissions (rate, suggest changes, see each other), who is shown,
 * expiry, asking for a name, an optional 4-number PIN, email invites with their status, Stop sharing, and Preview as guest.
 */
export function SharePanel({ kind, id, onClose }: { kind: 'collection' | 'shoot'; id: number; onClose: () => void }) {
  const links = useApi<ShareLink[]>(`/shares?kind=${kind}&id=${id}`);
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const [emails, setEmails] = useState('');
  const [note, setNote] = useState('');
  const [pinEdit, setPinEdit] = useState('');
  const link = links.data?.find((l) => l.status === 'active') ?? null;
  const inv = useApi<{ invites: Invite[]; canEmail: boolean }>(link ? `/shares/${link.id}/invites` : null);
  useEffect(() => setPinEdit(link?.pin ?? ''), [link?.pin]);

  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); links.reload(); } catch (e) { setErr((e as Error).message); } };
  const turnOn = () => run(() => api('/shares', { body: { kind, id, allowReview: true, allowSuggest: true } }));
  const patch = (body: object) => link && run(() => api(`/shares/${link.id}`, { method: 'PATCH', body }));
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch { window.prompt('Copy this', text); }
  };
  const stop = () => link && window.confirm('Stop sharing? Anyone using the link loses access straight away. What guests already sent is kept.') && run(() => api(`/shares/${link.id}`, { method: 'DELETE' }));
  const invite = async () => {
    if (!link) return;
    const list = emails.split(/[\s,;]+/).filter(Boolean);
    if (!list.length) return setErr('Enter at least one email address.');
    setErr('');
    try { await api(`/shares/${link.id}/invites`, { body: { emails: list, note } }); setEmails(''); setNote(''); inv.reload(); } catch (e) { setErr((e as Error).message); }
  };
  const noun = kind === 'shoot' ? 'photoshoot' : 'composition';

  return (
    <Modal title="Share for review" sub={`A private link to this ${noun}. Guests see only the pictures: no places, notes or anything else in your library.`} width={580} onClose={onClose}
      foot={<><span className="grow">{err ? <span className="reason" style={{ margin: 0 }} role="alert">{err}</span> : link ? `${link.views} view${link.views === 1 ? '' : 's'} · ${link.reviews} rating${link.reviews === 1 ? '' : 's'}` : ''}</span>
        {link && <><button className="btn" style={{ color: 'var(--danger)' }} onClick={stop}>Stop sharing</button><a className="btn outline" href={urlOf(link.token)} target="_blank" rel="noopener noreferrer">Preview as guest ↗</a></>}
        {!link && <button className="btn primary" onClick={turnOn}>Turn on the link</button>}</>}>
      <Row title="Link on"><Sw label="Link on" on={!!link} onClick={() => (link ? stop() : turnOn())} /></Row>
      {link && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="mono" style={{ flex: 1, background: 'var(--bg)', borderRadius: 999, padding: '10px 16px', fontSize: 13, color: 'var(--text2)', boxShadow: 'inset 0 0 0 1px var(--outline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{urlOf(link.token)}</div>
            <button className="btn primary" onClick={() => copy(urlOf(link.token), 'link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
          </div>
          {link.pin && <div className="muted" style={{ fontSize: 12.5 }}>Locked with PIN <b className="mono" style={{ color: 'var(--text)' }}>{link.pin}</b>. Guests enter it after the check. Send it separately.</div>}
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Guests can</div>
            <Row title="Rate photos"><Sw label="Rate photos" on={link.allowReview} onClick={() => patch({ allowReview: !link.allowReview })} /></Row>
            {kind === 'collection' && <Row title="Suggest changes" hint="Photos, frames and sizes. You approve each one."><Sw label="Suggest changes" on={link.allowSuggest} onClick={() => patch({ allowSuggest: !link.allowSuggest })} /></Row>}
            <Row title="See each other’s ratings"><Sw label="See each other" on={link.seeEachOther} onClick={() => patch({ seeEachOther: !link.seeEachOther })} /></Row>
            <Row title="Download originals"><Sw label="Download originals" on={link.allowDownload} onClick={() => patch({ allowDownload: !link.allowDownload })} /></Row>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>The link</div>
            <Row title="Show guests who else has looked"><Sw label="Show guests" on={link.showGuests} onClick={() => patch({ showGuests: !link.showGuests })} /></Row>
            <Row title="Ask for a name" hint="So you know who said what. Remembered on their device."><Sw label="Ask for a name" on={link.askName} onClick={() => patch({ askName: !link.askName })} /></Row>
            <Row title="Link expiry"><input type="date" aria-label="Link expiry" value={link.expiresAt ? link.expiresAt.slice(0, 10) : ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => patch({ expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })} /></Row>
            <Row title="PIN" hint="Four numbers, asked after the check. Five wrong tries lock the link on that device for 15 minutes."><Sw label="PIN" on={!!link.pin} onClick={() => patch({ pin: link.pin ? '' : true })} /></Row>
            {link.pin && (
              <div className="form" style={{ paddingBottom: 6 }}>
                <input className="field-in mono" style={{ width: 110, height: 40, textAlign: 'center', letterSpacing: '.3em', fontSize: 18 }} inputMode="numeric" maxLength={4} value={pinEdit} aria-label="PIN" onChange={(e) => setPinEdit(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onBlur={() => pinEdit.length === 4 && pinEdit !== link.pin && patch({ pin: pinEdit })} />
                <button className="btn outline" style={{ height: 34 }} onClick={() => patch({ pin: true })}>New</button>
                <button className="btn outline" style={{ height: 34 }} onClick={() => copy(link.pin, 'pin')}>{copied === 'pin' ? 'Copied' : 'Copy'}</button>
              </div>
            )}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Email invites</div>
            {inv.data && !inv.data.canEmail ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>This server can’t send email, so copy the link instead.</p> : (
              <>
                <input className="field-in" style={{ height: 40, marginBottom: 8 }} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Email addresses, separated by commas" aria-label="Email addresses" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="field-in" style={{ height: 40 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note (optional)" aria-label="Note" maxLength={400} />
                  <button className="btn outline" onClick={invite} disabled={!emails.trim()}>Send</button>
                </div>
                {(inv.data?.invites ?? []).slice(0, 8).map((i) => <div key={i.email + i.at} className="spread" style={{ fontSize: 13, padding: '6px 0' }}><span>{i.email}</span><span style={{ color: i.status === 'failed' ? 'var(--err)' : 'var(--ok)' }} title={i.error}>{i.status === 'sent' ? 'Sent' : 'Failed'}</span></div>)}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
