import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api, useApi } from '../api';
import ProtoAuth from '../proto/ProtoAuth';

/** Pages that work before anyone is signed in: sign in, sign up, the emailed code, terms, signed out. */
export const AUTH_PATHS = /^\/(signin|signup|signed-out|terms)\/?$/;

type Options = { providers: { id: string; name: string; type: string }[]; email: boolean; password: boolean; turnstile: { siteKey: string } | null; signups: boolean; serverName: string; signedIn: boolean };

const TERMS: { h: string; p: string }[] = [
  ['Who runs this', 'This Frames is a private, self-hosted server run by its owner. It is not a company service. Frames is open-source software; the people who wrote it do not run or see this server.'],
  ['Your account', 'You sign in with a one-time code emailed to you, a passkey, or with Google or Cloudflare Access. Don’t share sign-in codes. The owner can switch off any account at any time.'],
  ['Your photos', 'You keep all rights to the photos you upload. Frames only stores, resizes and shows them where you choose: your library, share links, community review or your portfolio.'],
  ['Sharing and guests', 'Share links show your photos to anyone who has the link (and its 4-digit PIN, if one is set), until it expires or you stop sharing. Guests can rate and suggest changes; they cannot download originals unless you allow it.'],
  ['Community review', 'If you opt in, other members rate your photos anonymously. Photos tagged nudity, violence or adult are never shown. Reported photos are reviewed by an administrator and may be removed.'],
  ['What’s not allowed', 'Uploading photos you don’t have the right to share, photos of people who haven’t agreed to be shared, or anything illegal. Harassing other members through reviews or notes.'],
  ['AI features', 'If AI is turned on, photos and their details may be sent to the AI providers listed in Settings to describe, tag or search them. Private shoots can be kept to local AI only.'],
  ['No guarantees', 'This server is run on a best-effort basis. Keep your own copies of anything important. Frames never deletes files in your connected cloud storage.'],
  ['Changes', 'If these terms change, you’ll be asked to agree again the next time you sign in.'],
].map(([h, p]) => ({ h, p }));

const returnTo = (qs: URLSearchParams) => { const r = qs.get('returnTo') ?? ''; return /^\/(?!\/)[\w\-./?=&%]*$/.test(r) ? r : '/'; };

/** The sign-in screens from the design, wired to the real sign-in: emailed code, passkey, providers and the Turnstile check. */
function AuthScreen({ view, lockProps }: { view: 'signin' | 'signup' | 'terms' | 'out' | 'lock'; lockProps?: { eyebrow: string; owner: string; lockedMsg: string; pin: (p: string) => Promise<void> } }) {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const o = useApi<Options>('/public/auth');
  useEffect(() => { if (o.data?.signedIn && view !== 'lock' && view !== 'out') nav('/', { replace: true }); }, [o.data, nav, view]);
  const err = qs.get('e');
  if (!o.data && view !== 'lock' && view !== 'out' && view !== 'terms') return <div className="auth-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>{o.error ? 'Could not load the sign-in options.' : 'Loading…'}</div>;
  const options = { ...(o.data ?? { providers: [], email: false, password: false, turnstile: null, signups: false, serverName: 'Frames', signedIn: false }), passkey: true } as Options & { passkey: boolean };
  const rt = returnTo(qs);
  return (
    <div className="auth-shell">
      <ProtoAuth
        key={view} view={view} options={options} terms={TERMS} initialError={err}
        sendCode={async (a: { email: string; name?: string; token: string }) => { await api('/public/auth/email/send', { body: { email: a.email, name: a.name, turnstile: a.token } }); }}
        verify={async (a: { email: string; code: string; name?: string }) => (await api<{ returnTo: string }>('/public/auth/email/verify', { body: { ...a, returnTo: rt } })).returnTo}
        provider={(id: string, token: string) => { const q = new URLSearchParams({ returnTo: rt }); if (token) q.set('cf-turnstile-response', token); window.location.assign(`/auth/login/${id}?${q}`); }}
        passkey={async () => {
          const { options: opts, cid } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; cid: string }>('/public/auth/passkey/options', { method: 'POST', body: {} });
          const response = await startAuthentication({ optionsJSON: opts });
          return (await api<{ returnTo: string }>('/public/auth/passkey/verify', { method: 'POST', body: { cid, response, returnTo: rt } })).returnTo;
        }}
        goPassword={() => window.location.assign('/auth/password')}
        lockEyebrow={lockProps?.eyebrow} lockOwner={lockProps?.owner} lockedMsg={lockProps?.lockedMsg} pin={lockProps?.pin}
        onTermsBack={(from: string) => { if (window.history.length > 1) nav(-1); else nav(from === 'signup' ? '/signup' : '/signin'); }}
      />
    </div>
  );
}

export const SignIn = () => <AuthScreen view="signin" />;
export const SignUp = () => <AuthScreen view="signup" />;
export const Terms = () => <AuthScreen view="terms" />;
export const SignedOut = () => <AuthScreen view="out" />;

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
  const gate = useApi<{ lockedFor: number }>(`/s/${token}/gate`);
  const locked = gate.data?.lockedFor ?? lockedFor ?? 0;
  const pin = async (p: string) => {
    try { await api(`/s/${token}/pin`, { body: { pin: p } }); onDone(); } catch (e) { gate.reload(); throw e; }
  };
  const mins = Math.ceil(locked / 60);
  return (
    <div className="auth-shell">
      <ProtoAuth view="lock" options={{ providers: [], email: false, password: false, turnstile: null, signups: false, serverName: 'Frames' }}
        lockEyebrow={`${owner ? `${owner} shared` : 'Shared'}${name ? ` ${name}` : ''}`} lockOwner={owner || 'the person who sent it'}
        lockedMsg={locked > 0 ? `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` : ''} pin={pin} />
    </div>
  );
}
