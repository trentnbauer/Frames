/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Auth.dc.html (sign in, sign up, the emailed code, terms, the link PIN, signed out).
// The options, the Turnstile check and every request come in through props (see pages/Auth.tsx).
import React from 'react';
import { DCLogic } from './runtime';
import { HumanCheck } from '../components/HumanCheck';

const okEmail = (x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim());

export class Logic extends DCLogic {
  state = { v: null, email: '', suName: '', suEmail: '', agree: false, err: null, suErr: '', code: '', codeEmail: '', codeFor: 'signin', codeErr: '', resent: false, lockVal: '', lockErr: '', tsToken: '', busy: false, termsFrom: 'signin' };
  componentWillUnmount() { clearTimeout(this.rt); }
  go(v, extra = {}) { this.setState({ v, err: '', suErr: '', ...extra }); }
  renderVals() {
    const S = { ...this.state }, P = this.props; const o = P.options || {};
    if (S.v === null) S.v = P.view || 'signin';
    if (S.err === null) S.err = P.initialError || '';
    const ts = o.turnstile; const passed = !ts || !!S.tsToken;
    const widget = ts ? React.createElement('div', { style: { marginBottom: 14 } }, React.createElement(HumanCheck, { siteKey: ts.siteKey, onToken: (t) => this.setState({ tsToken: t, err: '', suErr: '' }) })) : null;
    const providers = (o.providers || []);
    const run = async (fn, errKey) => { this.setState({ busy: true, [errKey]: '' }); try { await fn(); } catch (e) { this.setState({ [errKey]: e.message || 'That did not work.' }); } finally { this.setState({ busy: false }); } };
    const sendCode = (email, name, codeFor, errKey) => run(async () => { await P.sendCode({ email: email.trim(), name, token: S.tsToken }); this.go('code', { codeEmail: email.trim(), codeFor, code: '', codeErr: '', resent: false, suName: name || S.suName }); }, errKey);
    const siGo = () => { if (!passed) return this.setState({ err: 'Complete the check above first.' }); if (!okEmail(S.email)) return this.setState({ err: 'That email doesn’t look right.' }); sendCode(S.email, '', 'signin', 'err'); };
    const suGo = () => { if (!S.agree) return this.setState({ suErr: 'Agree to the terms to continue.' }); if (!passed) return this.setState({ suErr: 'Complete the check above first.' }); if (!S.suName.trim()) return this.setState({ suErr: 'Add your name.' }); if (!okEmail(S.suEmail)) return this.setState({ suErr: 'That email doesn’t look right.' }); sendCode(S.suEmail, S.suName.trim(), 'signup', 'suErr'); };
    const codeGo = () => { if (S.code.length !== 6) return this.setState({ codeErr: 'The code is 6 characters.' }); run(async () => { const to = await P.verify({ email: S.codeEmail, code: S.code, name: S.codeFor === 'signup' ? S.suName.trim() : undefined }); window.location.assign(to || '/'); }, 'codeErr').then(() => this.setState({ code: '' })); };
    const lockGo = () => { if (S.lockVal.length !== 4) return this.setState({ lockErr: 'The PIN is 4 digits.' }); run(async () => { await P.pin(S.lockVal); }, 'lockErr').then(() => this.setState({ lockVal: '' })); };
    const provider = (id) => { if (!passed) return this.setState({ err: 'Complete the check above first.', suErr: 'Complete the check above first.' }); P.provider(id, S.tsToken); };
    const v = S.v;
    const emailOn = !!o.email;
    return {
      isSignin: v === 'signin', isSignup: v === 'signup', isCode: v === 'code', isTerms: v === 'terms', isLock: v === 'lock', isSignedOut: v === 'out',
      isApp: false, isHand: false, isGate: false, isName: false, isGuestHome: false, isExpired: false, isPw: false, isStarted: false, states: [],
      serverName: o.serverName || 'Frames', tsWidget: widget,
      siTitle: 'Frames', siSub: 'Sign in to continue.', siSubGap: '10px', siShowAbout: true, siHasErr: !!S.err, siErr: S.err, siShowTs: !!ts, siShowForm: emailOn,
      siEmail: S.email, onSiEmail: (e) => this.setState({ email: e.target.value, err: '' }), siKey: (e) => { if (e.key === 'Enter') siGo(); }, siGo, siGoOp: S.busy ? 0.6 : 1,
      providers: providers.map((p) => ({ name: p.name, op: 1, go: () => provider(p.id) })),
      passkeyShow: !!o.passkey && typeof window !== 'undefined' && !!window.PublicKeyCredential, passkeyGo: () => run(async () => { const to = await P.passkey(); window.location.assign(to || '/'); }, 'err'),
      siShowPw: !!o.password || (o.signups && (emailOn || providers.length > 0)), goPw: () => P.goPassword(), goSignup: () => this.go('signup'), siBackShow: false, siBackLabel: '', goSignin: () => this.go('signin'),
      goTerms: () => this.go('terms', { termsFrom: 'signin' }),
      suSub: emailOn ? 'No password. We email you a code to finish, and each time you sign in.' : 'Email sign-in isn’t set up on this Frames, so use one of these accounts.', suHasErr: !!S.suErr || o.signups === false, suErr: o.signups === false ? 'New accounts are turned off here. Ask the owner to add you.' : S.suErr,
      agreeBg: S.agree ? '#efede8' : 'transparent', agreeTick: S.agree ? '✓' : '', toggleAgree: () => this.setState({ agree: !S.agree, suErr: '' }), goTermsFromSu: (e) => { e.stopPropagation(); this.go('terms', { termsFrom: 'signup' }); },
      tsOn: !!ts, smtpOn: emailOn, suName: S.suName, onSuName: (e) => this.setState({ suName: e.target.value, suErr: '' }), suEmail: S.suEmail, onSuEmail: (e) => this.setState({ suEmail: e.target.value, suErr: '' }), suGo, suGoOp: S.busy ? 0.6 : 1,
      suProviders: providers.map((p) => ({ name: p.name, op: o.signups === false ? 0.4 : 1, go: () => o.signups !== false && provider(p.id) })),
      codeEmail: S.codeEmail, codeHasErr: !!S.codeErr, codeErr: S.codeErr, codeVal: S.code, onCode: (e) => this.setState({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), codeErr: '' }), codeKey: (e) => { if (e.key === 'Enter') codeGo(); },
      codeGo, codeGoLabel: S.codeFor === 'signup' ? 'Create account' : 'Sign in', codeGoOp: S.code.length === 6 && !S.busy ? 1 : 0.5,
      codeResend: () => run(async () => { await P.sendCode({ email: S.codeEmail, name: S.codeFor === 'signup' ? S.suName.trim() : '', token: S.tsToken }); this.setState({ resent: true }); clearTimeout(this.rt); this.rt = setTimeout(() => this.setState({ resent: false }), 4000); }, 'codeErr'), resendLabel: S.resent ? 'New code sent' : 'Send a new code', codeBack: () => this.go(S.codeFor === 'signup' ? 'signup' : 'signin'),
      lockEyebrow: P.lockEyebrow || '', lockOwner: P.lockOwner || 'the person who sent it', lockHasErr: !!S.lockErr || !!P.lockedMsg, lockErr: P.lockedMsg || S.lockErr, lockVal: S.lockVal, onLock: (e) => this.setState({ lockVal: e.target.value.replace(/\D/g, '').slice(0, 4), lockErr: '' }), lockKey: (e) => { if (e.key === 'Enter') lockGo(); }, lockGo, lockGoOp: S.lockVal.length === 4 && !P.lockedMsg ? 1 : 0.5,
      terms: P.terms || [], termsBack: () => (P.onTermsBack ? P.onTermsBack(S.termsFrom) : this.go(S.termsFrom === 'signup' ? 'signup' : 'signin')), termsMeta: `${o.serverName || 'Frames'} · Last updated 10 Nov 2026`,
      outText: 'You’re signed out of this device.',
    };
  }
}
