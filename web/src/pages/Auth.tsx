import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { HumanCheck } from '../components/HumanCheck';
import { Mark } from '../components/Shell';

/** Pages that work before anyone is signed in: sign in, sign up, the emailed code, terms, signed out. */
export const AUTH_PATHS = /^\/(signin|signup|signed-out|terms)\/?$/;

type Options = { providers: { id: string; name: string; type: string }[]; email: boolean; password: boolean; turnstile: { siteKey: string } | null; signups: boolean; serverName: string; signedIn: boolean };

const TERMS: [string, string][] = [
  ['Who runs this', 'This Frames is a private, self-hosted server run by its owner. It is not a company service. Frames is open-source software; the people who wrote it do not run or see this server.'],
  ['Your account', 'You sign in with a one-time code emailed to you, or with Google or Cloudflare Access. Don’t share sign-in codes. The owner can switch off any account at any time.'],
  ['Your photos', 'You keep all rights to the photos you upload. Frames only stores, resizes and shows them where you choose: your library, share links, community review or your portfolio.'],
  ['Sharing and guests', 'Share links show your photos to anyone who has the link (and its 4-digit PIN, if one is set), until it expires or you stop sharing. Guests can rate and suggest changes; they cannot download originals unless you allow it.'],
  ['Community review', 'If you opt in, other members rate your photos anonymously. Photos tagged nudity, violence or adult are never shown. Reported photos are reviewed by an administrator and may be removed.'],
  ['What’s not allowed', 'Uploading photos you don’t have the right to share, photos of people who haven’t agreed to be shared, or anything illegal. Harassing other members through reviews or notes.'],
  ['AI features', 'If AI is turned on, photos and their details may be sent to the AI providers listed in Settings to describe, tag or search them. Private shoots can be kept to local AI only.'],
  ['No guarantees', 'This server is run on a best-effort basis. Keep your own copies of anything important. Frames never deletes files in your connected cloud storage.'],
  ['Changes', 'If these terms change, you’ll be asked to agree again the next time you sign in.'],
];

const okEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

function Frame({ server, children, wide }: { server?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-wrap">
      <main className={'auth' + (wide ? ' wide' : '')}>
        {server && <div className="auth-brand"><Mark />{server}</div>}
        {children}
      </main>
    </div>
  );
}
const Err = ({ children }: { children?: string }) => (children ? <div role="alert" className="auth-err">{children}</div> : null);
const Foot = () => <p className="auth-foot"><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a><Link to="/terms">Terms</Link></p>;

/** Cloudflare Turnstile, when this server has it on. `token` is what the server will check. */
function Check({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  return <div style={{ marginBottom: 14 }}><HumanCheck siteKey={siteKey} onToken={onToken} /></div>;
}

function useOptions() {
  const o = useApi<Options>('/public/auth');
  const nav = useNavigate();
  useEffect(() => { if (o.data?.signedIn) nav('/', { replace: true }); }, [o.data, nav]);
  return o;
}

const returnTo = (qs: URLSearchParams) => { const r = qs.get('returnTo') ?? ''; return /^\/(?!\/)[\w\-./?=&%]*$/.test(r) ? r : '/'; };

/** Asks for an emailed code, then checks it. Used by sign in, sign up and the guest "been here before" box. */
function CodeStep({ email, name, guest, back, done, mode }: { email: string; name?: string; guest?: boolean; back: () => void; done: (to: string) => void; mode: 'signin' | 'signup' }) {
  const [qs] = useSearchParams();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const go = async () => {
    if (code.length !== 6) return setErr('The code is 6 characters.');
    setBusy(true); setErr('');
    try { const r = await api<{ returnTo: string }>('/public/auth/email/verify', { body: { email, code, name, guest, returnTo: guest ? window.location.pathname : returnTo(qs) } }); done(r.returnTo); }
    catch (e) { setErr((e as Error).message); setCode(''); } finally { setBusy(false); }
  };
  const resend = async () => {
    setErr('');
    try { await api('/public/auth/email/send', { body: { email, name, guest, returnTo: guest ? window.location.pathname : undefined } }); setResent(true); setTimeout(() => setResent(false), 4000); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <>
      <h1 className="auth-h">Check your email</h1>
      <p className="auth-p">We sent a 6-character code to <b style={{ color: 'var(--text)', fontWeight: 500 }}>{email}</b>. It works once, for 10 minutes.</p>
      <Err>{err}</Err>
      <input className="auth-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setErr(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="······" maxLength={6} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} aria-label="Sign-in code" autoFocus />
      <button className="btn primary md auth-btn" onClick={go} disabled={busy || code.length !== 6}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      <div className="spread" style={{ fontSize: 13, marginTop: 4 }}>
        <button className="muted" onClick={resend}>{resent ? 'New code sent' : 'Send a new code'}</button>
        <button className="muted" onClick={back}>Use a different email</button>
      </div>
    </>
  );
}

export function SignIn() {
  const o = useOptions();
  const [qs] = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [err, setErr] = useState(qs.get('e') ?? '');
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false);
  const d = o.data;
  const rt = returnTo(qs);
  if (!d) return <Frame><p className="auth-p">{o.error ? 'Could not load the sign-in options.' : 'Loading…'}</p></Frame>;
  const needCheck = !!d.turnstile && !token;
  const send = async () => {
    if (needCheck) return setErr('Complete the check above first.');
    if (!okEmail(email)) return setErr('That email doesn’t look right.');
    setBusy(true); setErr('');
    try { await api('/public/auth/email/send', { body: { email: email.trim(), turnstile: token } }); setStep('code'); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (step === 'code') return <Frame server={d.serverName}><CodeStep email={email.trim()} mode="signin" back={() => setStep('start')} done={(to) => { window.location.assign(to); }} /></Frame>;
  const provider = (id: string) => { if (needCheck) return setErr('Complete the check above first.'); const q = new URLSearchParams({ returnTo: rt }); if (token) q.set('cf-turnstile-response', token); window.location.assign(`/auth/login/${id}?${q}`); };
  return (
    <Frame server={d.serverName}>
      <h1 className="auth-h">Frames</h1>
      <p className="auth-p" style={{ marginBottom: 10 }}>Sign in to continue.</p>
      <p className="auth-about">Frames is a self-hosted home for your photographs. Rate them over time, plan prints for your walls, share them with friends for feedback, and publish the best to a portfolio.</p>
      <Err>{err}</Err>
      {d.turnstile && <Check siteKey={d.turnstile.siteKey} onToken={(t) => { setToken(t); setErr(''); }} />}
      {d.email && (
        <>
          <input className="auth-in" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Email" autoComplete="email" aria-label="Email" />
          <button className="btn primary md auth-btn" onClick={send} disabled={busy}>Email me a sign-in code</button>
          <span className="auth-hint">A 6-character code, good for 10 minutes. No password.</span>
          {d.providers.length > 0 && <div className="auth-or"><i />or<i /></div>}
        </>
      )}
      {d.providers.map((p) => <button key={p.id} className="btn outline md auth-btn" onClick={() => provider(p.id)}>Continue with {p.name}</button>)}
      {!d.email && !d.providers.length && !d.password && <Err>Sign-in is not set up on this Frames yet. Ask the owner.</Err>}
      <div className="spread" style={{ fontSize: 13, marginTop: 4 }}>
        {d.password ? <a className="muted" href={`/auth/password`}>Use the shared password instead</a> : <span />}
        {d.signups && (d.email || d.providers.length > 0) && <Link to="/signup" style={{ color: 'var(--text)' }}>Create an account</Link>}
      </div>
      <Foot />
    </Frame>
  );
}

export function SignUp() {
  const o = useOptions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false);
  const d = o.data;
  if (!d) return <Frame><p className="auth-p">Loading…</p></Frame>;
  const needCheck = !!d.turnstile && !token;
  const gate = (): string => (!agree ? 'Agree to the terms to continue.' : needCheck ? 'Complete the check above first.' : '');
  const send = async () => {
    const g = gate(); if (g) return setErr(g);
    if (!name.trim()) return setErr('Add your name.');
    if (!okEmail(email)) return setErr('That email doesn’t look right.');
    setBusy(true); setErr('');
    try { await api('/public/auth/email/send', { body: { email: email.trim(), name: name.trim(), turnstile: token } }); setStep('code'); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const provider = (id: string) => { const g = gate(); if (g) return setErr(g); const q = new URLSearchParams(); if (token) q.set('cf-turnstile-response', token); window.location.assign(`/auth/login/${id}?${q}`); };
  if (step === 'code') return <Frame server={d.serverName}><CodeStep email={email.trim()} name={name.trim()} mode="signup" back={() => setStep('start')} done={(to) => window.location.assign(to)} /></Frame>;
  return (
    <Frame server={d.serverName}>
      <h1 className="auth-h">Create an account</h1>
      <p className="auth-p">{d.email ? 'No password. We email you a code to finish, and each time you sign in.' : 'Email sign-in isn’t set up on this Frames, so use one of these accounts.'}</p>
      {!d.signups && <Err>New accounts are turned off here. Ask the owner to add you.</Err>}
      <Err>{err}</Err>
      <label className="auth-agree"><input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(''); }} /><span>I agree to the <Link to="/terms?from=signup">Terms of service</Link> for this Frames.</span></label>
      {d.turnstile && <Check siteKey={d.turnstile.siteKey} onToken={(t) => { setToken(t); setErr(''); }} />}
      {d.email && (
        <>
          <input className="auth-in" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="Your name" autoComplete="name" aria-label="Your name" />
          <input className="auth-in" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="Email" autoComplete="email" aria-label="Email" />
          <button className="btn primary md auth-btn" onClick={send} disabled={busy || !d.signups}>Email me a code to finish</button>
        </>
      )}
      {d.providers.map((p) => <button key={p.id} className="btn outline md auth-btn" onClick={() => provider(p.id)} disabled={!d.signups}>Sign up with {p.name}</button>)}
      <Link to="/signin" className="muted" style={{ fontSize: 13, marginTop: 4 }}>I already have an account</Link>
      <Foot />
    </Frame>
  );
}

export function Terms() {
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const o = useApi<Options>('/public/auth');
  return (
    <div className="auth-wrap top">
      <main className="auth terms">
        <button className="muted" style={{ fontSize: 13, marginBottom: 24 }} onClick={() => (window.history.length > 1 ? nav(-1) : nav(qs.get('from') === 'signup' ? '/signup' : '/signin'))}>← Back</button>
        <h1 className="auth-h">Terms of service</h1>
        <p className="auth-p" style={{ marginBottom: 28 }}>{o.data?.serverName ?? 'Frames'} · Last updated 10 Nov 2026</p>
        {TERMS.map(([h, p]) => <section key={h} style={{ marginBottom: 22 }}><h2 className="serif" style={{ fontSize: 22, margin: '0 0 6px' }}>{h}</h2><p className="t2" style={{ margin: 0, lineHeight: 1.6 }}>{p}</p></section>)}
      </main>
    </div>
  );
}

export function SignedOut() {
  return (
    <Frame server="Frames">
      <h1 className="auth-h">Signed out</h1>
      <p className="auth-p">You’re signed out of this device.</p>
      <Link to="/signin" className="btn primary md auth-btn" style={{ textDecoration: 'none' }}>Sign in again</Link>
      <span className="auth-hint">On a shared computer? Close this window too.</span>
    </Frame>
  );
}

/** Routes the auth paths to their screens. Rendered by App before anything that needs a login. */
export function AuthApp() {
  const { pathname } = useLocation();
  const p = pathname.replace(/\/$/, '');
  useEffect(() => { document.title = `${p === '/signup' ? 'Create an account' : p === '/terms' ? 'Terms' : p === '/signed-out' ? 'Signed out' : 'Sign in'} · Frames`; }, [p]);
  if (p === '/signup') return <SignUp />;
  if (p === '/terms') return <Terms />;
  if (p === '/signed-out') return <SignedOut />;
  return <SignIn />;
}

/** The guest's "link PIN" screen: four numbers, five tries. */
export function PinGate({ token, owner, name, lockedFor, onDone }: { token: string; owner?: string; name?: string; lockedFor?: number; onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [locked, setLocked] = useState(lockedFor ?? 0);
  useEffect(() => { if (locked <= 0) return; const t = setInterval(() => setLocked((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(t); }, [locked > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    if (pin.length !== 4) return setErr('The PIN is 4 numbers.');
    try { await api(`/s/${token}/pin`, { body: { pin } }); onDone(); }
    catch (e) { const m = (e as Error).message; setErr(m); setPin(''); api<{ lockedFor: number }>(`/s/${token}/gate`).then((g) => setLocked(g.lockedFor)).catch(() => undefined); }
  };
  return (
    <Frame>
      {(owner || name) && <div className="eyebrow" style={{ marginBottom: 14 }}>{owner ? `${owner} shared` : 'Shared'}{name ? ` ${name}` : ''}</div>}
      <h1 className="auth-h">Enter the PIN</h1>
      <p className="auth-p">This link is locked with a 4-digit PIN. Ask {owner || 'the person who sent it'} for it if you don’t have it.</p>
      {locked > 0 && <Err>{`Too many wrong tries. Try again in ${Math.ceil(locked / 60)} minute${Math.ceil(locked / 60) === 1 ? '' : 's'}.`}</Err>}
      {locked <= 0 && <Err>{err}</Err>}
      <input className="auth-code pin" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        placeholder="····" inputMode="numeric" maxLength={4} autoComplete="off" aria-label="Link PIN" disabled={locked > 0} autoFocus />
      <button className="btn primary md auth-btn" onClick={go} disabled={locked > 0 || pin.length !== 4}>Open</button>
    </Frame>
  );
}
