import { useState } from 'react';
import { api, useApi } from '../api';
import { HumanCheck } from './HumanCheck';
import { Mark } from './Shell';

export function PasswordSignIn({ serverName, siteKey, returnTo, onBack }: { serverName: string; siteKey?: string; returnTo: string; onBack: () => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [token, setToken] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <main style={{ width: 'min(380px, calc(100vw - 32px))', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div className="lockup" style={{ fontSize: 20 }}><Mark />{serverName}</div>
    <h1 className="serif" style={{ fontSize: 44, lineHeight: 1, margin: 0 }}>Sign in with a password</h1>
    <form style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError('');
      try { const result = await api<{ returnTo: string }>('/public/auth/password', { body: { email, password, turnstile: token, returnTo } }); window.location.assign(result.returnTo); }
      catch (e) { setError((e as Error).message); setPassword(''); }
      finally { setBusy(false); }
    }}>
      <label className="fld">Email<input className="field-in" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="fld">Password<input className="field-in" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {siteKey && <HumanCheck siteKey={siteKey} onToken={setToken} />}
      {error && <div role="alert" className="reason">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="muted" style={{ fontSize: 13, margin: 0 }}>Forgot your password? Sign in another way, then set a new password in Password &amp; security. If you have no other method, ask your administrator for help.</p>
    <button className="t2" onClick={onBack} style={{ alignSelf: 'flex-start' }}>Other sign-in methods</button>
    <a href="/privacy" className="muted" style={{ fontSize: 13 }}>Privacy</a>
  </main>;
}

export function AccountPassword({ onSaved }: { onSaved: () => void }) {
  const status = useApi<{ enabled: boolean; hasPassword: boolean; email: string; bootstrap: boolean }>('/me/password');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!status.data) return <p className="muted">{status.error || 'Loading…'}</p>;
  const s = status.data;
  return <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await api('/me/password', { method: 'PUT', body: { email, password, currentPassword: current } }); setPassword(''); setConfirm(''); setCurrent(''); if (s.bootstrap) window.location.assign('/settings?section=password-security'); else onSaved(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }}>
    <p className="muted" style={{ margin: 0 }}>{s.bootstrap ? 'Create the owner’s password, then turn on Require sign-in in Server → Sign-in & access.' : `Sign in with ${s.email}. Changing your password signs out your other sessions.`}</p>
    {!s.enabled && <p className="reason">Password sign-in is disabled by your administrator.</p>}
    {s.bootstrap && <label className="fld">Email<input className="field-in" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
    {s.hasPassword && <label className="fld">Current password<input className="field-in" type="password" autoComplete="current-password" maxLength={256} value={current} onChange={(e) => setCurrent(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>Optional if you signed in within the last 15 minutes.</span></label>}
    <label className="fld">New password<input className="field-in" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={(e) => setPassword(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>12–256 characters. You can paste from a password manager.</span></label>
    <label className="fld">Confirm new password<input className="field-in" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
    {error && <div role="alert" className="reason">{error}</div>}
    <button className="btn primary" type="submit" disabled={busy || !s.enabled}>{busy ? 'Saving…' : s.hasPassword ? 'Change password' : 'Set password'}</button>
  </form>;
}
