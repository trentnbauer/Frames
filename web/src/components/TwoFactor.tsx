import { AuthenticatorQr } from './AuthenticatorQr';
import { useState } from 'react';
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api, useApi } from '../api';

export type MfaStatus = { policy: 'off' | 'admins' | 'members'; required: boolean; verified: boolean; enrolled?: boolean; totp: boolean; passkeys: number };
export function TwoFactor({ gate = false }: { gate?: boolean }) {
  const status = useApi<MfaStatus>('/me/mfa');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = () => window.location.reload();
  const passkey = (register: boolean) => run(async () => {
    if (register) {
      const { options, cid } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; cid: string }>('/me/passkeys/options', { body: {} });
      const response = await startRegistration({ optionsJSON: options });
      await api('/me/passkeys/verify', { body: { cid, response, name: 'This device' } });
    } else {
      const { options, cid } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; cid: string }>('/me/mfa/passkey/options', { body: {} });
      const response = await startAuthentication({ optionsJSON: options });
      await api('/me/mfa/passkey/verify', { body: { cid, response } });
    }
    if (gate) finish(); else status.reload();
  });
  const submit = () => run(async () => {
    if (setup) {
      const result = await api<{ recoveryCodes: string[] }>('/me/mfa/totp/confirm', { body: { code: code.trim() } });
      setCodes(result.recoveryCodes); setSetup(null); setCode(''); status.reload();
    } else if (removing) {
      await api('/me/mfa/totp', { method: 'DELETE', body: { code: code.trim() } });
      setRemoving(false); setCode(''); status.reload();
    } else { await api('/me/mfa/totp/verify', { body: { code: code.trim() } }); if (gate) finish(); else { setCode(''); status.reload(); } }
  });
  const s = status.data;
  if (!s) return <p role={status.error ? 'alert' : undefined}>{status.error || 'Loading security settings…'}</p>;
  const enrolled = s.enrolled ?? (s.totp || s.passkeys > 0);
  const canSetup = !s.totp && (!enrolled || s.verified);
  const input = setup || removing || (s.totp && !s.verified);
  return <div className="mfa-controls">
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    {codes.length > 0 ? <>
      <h3>Save your recovery codes</h3><p>Each code works once if you lose your authenticator. Store them somewhere safe; they will not be shown again.</p>
      <div className="mfa-recovery">{codes.map((value) => <code key={value}>{value}</code>)}</div>
      <button type="button" className="btn primary" onClick={() => { if (gate) finish(); else setCodes([]); }}>I saved the codes</button>
    </> : <>
      <p>{s.required ? 'Two-factor authentication is required for your account.' : 'Add an authenticator app to require a second factor when you sign in.'} Passkeys use your fingerprint, face or device PIN.</p>
      {s.verified && <p role="status">This session has verified a security factor.</p>}
      {setup && <div className="mfa-controls"><p>Scan this QR code with your authenticator app, then enter its six-digit code below. If you cannot scan it, add the setup key manually (time-based, 30 seconds).</p><AuthenticatorQr uri={setup.uri} /><code className="mfa-secret">{setup.secret}</code><a className="btn outline" href={setup.uri}>Open authenticator app</a></div>}
      {input && <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mfa-controls">
        <label>{setup ? 'Authenticator code' : 'Authenticator or recovery code'}<input autoComplete="one-time-code" aria-label={setup ? 'Authenticator code' : 'Authenticator or recovery code'} value={code} onChange={(e) => setCode(e.target.value)} maxLength={16} disabled={busy} /></label>
        <button type="submit" className="btn primary" disabled={busy || !code.trim()}>{removing ? 'Remove authenticator' : setup ? 'Confirm authenticator' : 'Verify code'}</button>
      </form>}
      {setup && <button type="button" className="btn" disabled={busy} onClick={() => { setSetup(null); setCode(''); setError(''); }}>Start over</button>}
      {removing && <button type="button" className="btn" disabled={busy} onClick={() => { setRemoving(false); setCode(''); setError(''); }}>Cancel</button>}
      {!setup && canSetup && <button type="button" className="btn outline" disabled={busy} onClick={() => void run(async () => { setSetup(await api('/me/mfa/totp/setup', { body: {} })); setCode(''); })}>Set up authenticator app</button>}
      {!setup && s.passkeys > 0 && !s.verified && <button type="button" className="btn primary" disabled={busy} onClick={() => void passkey(false)}>Verify with passkey</button>}
      {!setup && !s.totp && !enrolled && <button type="button" className="btn outline" disabled={busy} onClick={() => void passkey(true)}>Add a passkey</button>}
      {!gate && s.totp && s.verified && !removing && <button type="button" className="btn outline" disabled={busy} onClick={() => setRemoving(true)}>Remove authenticator app</button>}
    </>}
  </div>;
}
export function TwoFactorGate() {
  return <div className="auth-shell"><main style={{ width: 'min(460px, 100%)' }}><h1 className="serif" style={{ fontSize: 40, marginBottom: 16 }}>Secure your sign-in</h1><TwoFactor gate /><button type="button" className="btn" style={{ marginTop: 24 }} onClick={() => void fetch('/auth/logout', { method: 'POST' }).then(() => window.location.assign('/signin'))}>Sign out</button></main></div>;
}
