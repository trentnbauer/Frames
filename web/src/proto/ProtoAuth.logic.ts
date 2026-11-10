/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Auth.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { v: this.props.start || (this.props.flow === 'guest' ? 'gate' : 'signin'), ts: 'idle', err: '', pw: '', pwErr: '', name: '', menu: false, out: 'one', hand: '', email: '', suName: '', suEmail: '', agree: false, suErr: '', termsFrom: 'signin', gEmail: '', code: '', codeEmail: '', codeFor: 'signin', sentCode: '', codeErr: '', resent: false, lockVal: '', lockErr: '', smtp: null };
  rndCode() { const C = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += C[Math.floor(Math.random() * C.length)]; return s; }
  rndPin() { let p; do { p = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (/^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)); return p; }
  componentWillUnmount() { clearTimeout(this.t1); clearTimeout(this.t2); }
  go(v, extra = {}) { clearTimeout(this.t1); clearTimeout(this.t2); this.setState({ v, ts: 'idle', menu: false, ...extra }); }
  renderVals() {
    const S = this.state; const ts = S.ts; const tsOn = this.props.turnstile !== false;
    const spinEl = (c) => React.createElement('i', { style: { width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.2)', borderTopColor: c || '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } });
    const tsIcon = ts === 'busy' ? spinEl('#f6821f') : ts === 'ok' ? React.createElement('span', { style: { width: 24, height: 24, borderRadius: '50%', background: '#2db35d', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 } }, '✓') : React.createElement('span', { style: { width: 24, height: 24, borderRadius: 3, boxShadow: 'inset 0 0 0 2px #8a8a8a', display: 'inline-block' } });
    const passed = !tsOn || ts === 'ok';
    const tsClick = () => { if (ts !== 'idle') return; this.setState({ ts: 'busy' }); this.t1 = setTimeout(() => { this.setState({ ts: 'ok' }); if (S.v === 'gate') this.t2 = setTimeout(() => this.go('lock', { lockVal: '', lockErr: '' }), 700); }, 1300); };
    const MSG = { list: ['Not on the list', 'trent.b@gmail.com is not allowed to use this Frames. Ask the owner to add it.'], slow: ['Slow down', 'Too many sign-in attempts. Try again in a minute.'], noacct: ['No account', 'New accounts are turned off here, or this account has been switched off. Ask the owner to add you.'] };
    const msg = MSG[S.v];
    const signin = (name) => { if (!passed) { this.setState({ err: 'Tick the check above first.' }); return; } this.go('hand', { hand: name, err: '' }); this.t1 = setTimeout(() => this.go(S.guestFlow ? 'guesthome' : 'app', { guestFlow: false }), 1400); };
    const okName = S.name.trim().length > 0;
    const emailOk = (x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim()); const digits = (e) => e.target.value.replace(/\D/g, '').slice(0, 4);
    const smtp = S.smtp !== null ? S.smtp : this.props.smtpOn !== false;
    const sendCode = (email, codeFor) => this.go('code', { codeEmail: email.trim(), codeFor, code: '', codeErr: '', resent: false, sentCode: this.rndCode(), err: '', suErr: '' });
    const siOk = emailOk(S.email);
    const siGo = () => { if (!passed) { this.setState({ err: 'Tick the check above first.' }); return; } if (!siOk) { this.setState({ err: 'That email doesn’t look right.' }); return; } sendCode(S.email, 'signin'); };
    const suOk = S.suName.trim() && emailOk(S.suEmail) && S.agree && passed;
    const gOk = emailOk(S.gEmail);
    const codeOk = S.code.length === 6;
    const codeGo = () => { if (!codeOk) return this.setState({ codeErr: 'The code is 6 characters.' }); if (S.code !== S.sentCode) return this.setState({ codeErr: 'That code isn’t right, or it has expired. 5 wrong tries and you’ll need a new one.', code: '' }); this.go(S.codeFor === 'guest' ? 'guesthome' : 'app', { hand: 'email code' }); };
    const lockGo = () => { if (S.lockVal.length !== 4) return this.setState({ lockErr: 'The PIN is 4 digits.' }); if (S.lockVal !== '4827') return this.setState({ lockErr: 'That PIN isn’t right. 5 wrong tries locks this link on this device for 15 minutes.', lockVal: '' }); this.go('name'); };
    const TERMS = [
      ['Who runs this', 'This Frames is a private, self-hosted server run by Trent Bauer. It is not a company service. Frames is open-source software; the people who wrote it do not run or see this server.'],
      ['Your account', 'You sign in with a one-time code emailed to you, or with Google or Cloudflare Access. Don’t share sign-in codes. The owner can switch off any account at any time.'],
      ['Your photos', 'You keep all rights to the photos you upload. Frames only stores, resizes and shows them where you choose: your library, share links, community review or your portfolio.'],
      ['Sharing and guests', 'Share links show your photos to anyone who has the link (and its 4-digit PIN, if one is set), until it expires or you stop sharing. Guests can rate and suggest changes; they cannot download originals unless you allow it.'],
      ['Community review', 'If you opt in, other members rate your photos anonymously. Photos tagged nudity, violence or adult are never shown. Reported photos are reviewed by the owner and may be removed.'],
      ['What’s not allowed', 'Uploading photos you don’t have the right to share, photos of people who haven’t agreed to be shared, or anything illegal. Harassing other members through reviews or notes.'],
      ['AI features', 'If AI is turned on, photos and their details may be sent to the AI providers listed in Settings to describe, tag or search them. Private shoots can be kept to local AI only.'],
      ['No guarantees', 'This server is run on a best-effort basis. Keep your own copies of anything important. Frames never deletes files in your connected cloud storage.'],
      ['Changes', 'If these terms change, you’ll be asked to agree again the next time you sign in.'],
    ];
    const states = [['signin', 'Sign in'], ['code', 'Email code'], ['signup', 'Sign up'], ['terms', 'Terms'], ['pw', 'Password'], ['list', 'Not on list'], ['app', 'Signed in'], ['out', 'Signed out'], ['gate', 'Share link'], ['lock', 'Link PIN'], ['name', 'Your name'], ['expired', 'Link ended'], ['guesthome', 'Guest home']];
    return {
      screenLabel: 'Auth · ' + (states.find((x) => x[0] === S.v) || ['', S.v])[1], serverName: 'Frames · frames.trent.au',
      isSignin: S.v === 'signin' || !!msg, siShowAbout: !msg, siSubGap: msg ? '22px' : '10px', siTitle: msg ? msg[0] : 'Frames', siSub: msg ? msg[1] : 'Sign in to continue.', siHasErr: !!S.err && !msg, siErr: S.err,
      siShowTs: tsOn && !msg, siShowPw: !msg, siBackShow: !!msg, siBackLabel: 'Back to sign in',
      smtpOn: smtp, siShowForm: !msg && smtp, siEmail: S.email, onSiEmail: (e) => this.setState({ email: e.target.value, err: '' }),
      siKey: (e) => { if (e.key === 'Enter') siGo(); }, siGo, siGoOp: siOk && passed ? 1 : 0.5,
      goSignup: () => this.go('signup', { suErr: '', err: '' }), goTerms: () => this.go('terms', { termsFrom: 'signin' }),
      isSignup: S.v === 'signup', tsOn, suName: S.suName, suEmail: S.suEmail, onSuName: (e) => this.setState({ suName: e.target.value, suErr: '' }), onSuEmail: (e) => this.setState({ suEmail: e.target.value, suErr: '' }),
      suSub: smtp ? 'No password. We email you a code to finish, and each time you sign in.' : 'Email sign-in isn’t set up on this Frames, so use one of these accounts.',
      agreeBg: S.agree ? '#efede8' : 'transparent', agreeTick: S.agree ? '✓' : '', toggleAgree: () => this.setState({ agree: !S.agree, suErr: '' }),
      goTermsFromSu: (e) => { e.stopPropagation(); this.go('terms', { termsFrom: 'signup' }); },
      suHasErr: !!S.suErr, suErr: S.suErr, suGoOp: suOk ? 1 : 0.5,
      suGo: () => { if (!S.agree) return this.setState({ suErr: 'Agree to the terms to continue.' }); if (!passed) return this.setState({ suErr: 'Tick the check above first.' }); if (!S.suName.trim()) return this.setState({ suErr: 'Add your name.' }); if (!emailOk(S.suEmail)) return this.setState({ suErr: 'That email doesn’t look right.' }); sendCode(S.suEmail, 'signup'); },
      suProviders: ['Google', 'Cloudflare Access'].map((name) => ({ name, op: S.agree && passed ? 1 : 0.5, go: () => { if (!S.agree) return this.setState({ suErr: 'Agree to the terms to continue.' }); if (!passed) return this.setState({ suErr: 'Tick the check above first.' }); this.go('hand', { hand: name }); this.t1 = setTimeout(() => this.go('app'), 1400); } })),
      isCode: S.v === 'code', codeEmail: S.codeEmail || 'trent@example.com', codeVal: S.code, sentCode: S.sentCode,
      onCode: (e) => this.setState({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), codeErr: '' }), codeKey: (e) => { if (e.key === 'Enter') codeGo(); },
      codeHasErr: !!S.codeErr, codeErr: S.codeErr, codeGo, codeGoOp: codeOk ? 1 : 0.5, codeGoLabel: S.codeFor === 'signup' ? 'Create account' : S.codeFor === 'guest' ? 'Continue' : 'Sign in',
      resendLabel: S.resent ? '✓ New code sent' : 'Send a new code', codeResend: () => this.setState({ sentCode: this.rndCode(), resent: true, code: '', codeErr: '' }),
      codeBack: () => this.go(S.codeFor === 'signup' ? 'signup' : S.codeFor === 'guest' ? 'name' : 'signin'),
      isLock: S.v === 'lock', lockVal: S.lockVal, onLock: (e) => this.setState({ lockVal: e.target.value.replace(/\D/g, '').slice(0, 4), lockErr: '' }), lockKey: (e) => { if (e.key === 'Enter') lockGo(); },
      lockHasErr: !!S.lockErr, lockErr: S.lockErr, lockGo, lockGoOp: S.lockVal.length === 4 ? 1 : 0.5,
      isTerms: S.v === 'terms', terms: TERMS.map(([h, p]) => ({ h, p })), termsBack: () => this.go(S.termsFrom || 'signin'),
      gEmail: S.gEmail, onGEmail: (e) => this.setState({ gEmail: e.target.value }), gGoOp: gOk ? 1 : 0.5,
      gGo: () => { if (gOk) sendCode(S.gEmail, 'guest'); },
      smtpLabel: smtp ? 'Email on' : 'Email off', smtpBg: smtp ? 'rgba(120,200,140,.18)' : 'rgba(231,140,120,.16)', smtpFg: smtp ? 'oklch(0.82 0.1 150)' : '#e79a82', toggleSmtp: () => this.setState({ smtp: !smtp }),
      providers: msg ? [] : ['Google', 'Cloudflare Access'].map((name) => ({ name, op: passed ? 1 : 0.5, go: () => signin(name) })),
      tsClick, tsIcon, tsLabel: ts === 'busy' ? 'Verifying…' : ts === 'ok' ? 'Success!' : 'Verify you are human', tsCursor: ts === 'idle' ? 'pointer' : 'default',
      goPw: () => this.go('pw', { pw: '', pwErr: '' }), goSignin: () => this.go('signin', { err: '' }),
      isPw: S.v === 'pw', pwVal: S.pw, onPw: (e) => this.setState({ pw: e.target.value, pwErr: '' }), pwHasErr: !!S.pwErr, pwErr: S.pwErr,
      pwGo: () => { if (S.pw === 'frames') this.go('app'); else this.setState({ pwErr: S.pw ? 'That isn’t the password. 10 wrong tries in a minute locks this address out for a minute.' : 'Type the password.' }); },
      pwKey: (e) => { if (e.key === 'Enter') { if (S.pw === 'frames') this.go('app'); else this.setState({ pwErr: 'That isn’t the password. Try “frames” in this prototype.' }); } },
      isHand: S.v === 'hand', handTo: S.hand, spin: spinEl(), handDone: () => this.go('app'),
      isApp: S.v === 'app', menuOpen: S.menu, toggleMenu: () => this.setState({ menu: !S.menu }), signedVia: S.hand || 'shared password',
      appClick: (e) => { const t = e.target.closest && e.target.closest('[data-go]'); if (!t) return; e.preventDefault(); e.stopPropagation(); if (t.dataset.go === 'profile') this.setState({ menu: !S.menu }); },
      signOut: () => this.go('out', { out: 'one' }), signOutAll: () => this.go('out', { out: 'all' }),
      isSignedOut: S.v === 'out', outText: S.out === 'all' ? 'You’re signed out on every device. Each one will ask you to sign in again.' : 'You’re signed out on this device. Share links and portfolios still work without signing in.',
      isGate: S.v === 'gate', isName: S.v === 'name', guestName: S.name, onGuestName: (e) => this.setState({ name: e.target.value }), nameOp: okName ? 1 : 0.4,
      nameGo: () => okName && this.go('started'), nameKey: (e) => { if (e.key === 'Enter' && okName) this.go('started'); },
      guestProviders: ['Google', 'Microsoft'].map((name) => ({ name, label: 'Continue with ' + name, go: () => { this.go('hand', { hand: name }); this.t1 = setTimeout(() => this.go('guesthome'), 1400); } })),
      isStarted: S.v === 'started', guestShown: S.name.trim() || 'there', isExpired: S.v === 'expired', isGuestHome: S.v === 'guesthome',
      guestLinks: [['Kitchen wall', 'composition', 'from Trent · opened today', 7], ['Rottnest, March', 'photoshoot', 'from Trent · 3 Nov', 1], ['Hallway triptych', 'composition', 'from Mia · 28 Oct', 4]].map(([label, kind, from, n]) => ({ label, kind, from, src: 'photos/p' + n + '.jpg' })),
      states: states.map(([k, label]) => ({ label, bg: S.v === k || (k === 'signin' && S.v === 'hand') ? '#efede8' : 'transparent', fg: S.v === k ? '#0d0d0d' : '#a8a59f', go: () => this.go(k, { err: '', name: S.name, ...(k === 'code' && !S.sentCode ? { sentCode: this.rndCode(), codeFor: 'signin' } : {}) }) })),
    };
  }
}
