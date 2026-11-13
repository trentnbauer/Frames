import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSession, loadAuth, saveAuth } from './auth.js';
import { getSecret } from './ai.js';
import { setSetting, type DB } from './db.js';
import { beginTotp, confirmTotp, totpCode } from './mfa.js';
import { checkPassword, hasPassword, passwordHash, savePasswordHash } from './passwords.js';
import { saveTurnstile } from './turnstile.js';
import { scrubCopy } from './backup.js';
import { resolveUser, updateUser, deleteUserRow, type User } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';
let env: Env, sys: DB, user: User, token: string;
const password = () => `test password ${crypto.randomBytes(16).toString('hex')}`;
const cookie = (value: string) => ({ cookie: `frames_session=${value}` });
const call = (method: 'GET'|'POST'|'PUT', url: string, body?: object, session = token) => env.app.inject({ method, url, payload: body, headers: cookie(session) });
const login = (email: unknown, pw: unknown, extra: object = {}, remoteAddress = '127.0.0.1') => env.app.inject({ method: 'POST', url: '/api/public/auth/password', payload: { email, password: pw, ...extra }, remoteAddress });
const sessionFrom = (response: any) => { const headers = response.headers['set-cookie']; return (Array.isArray(headers) ? headers : [headers]).find((v: string) => v.startsWith('frames_session='))!.split(';')[0].split('=')[1]; };
beforeEach(() => {
  env = makeEnv(); sys = (env.app as any).frames.sys;
  user = resolveUser(sys, { provider: 'email', sub: 'owner@password.test', email: 'owner@password.test', emailVerified: true, name: 'Owner' }, true)!;
  saveAuth(sys, { enabled: true, password: true, providers: [], allow: [user.email], publicUrl: '', testedBy: { provider: 'password', sub: user.email, email: user.email, emailVerified: true, name: user.name } });
  token = createSession(sys, user.id);
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await env.app.close(); cleanup(env); });

it('stores salted encrypted hashes and never returns passwords or hashes in account/config APIs', async () => {
  const pw = password(); expect((await call('PUT', '/api/me/password', { password: pw })).statusCode).toBe(200);
  expect(await checkPassword(sys, user.id, pw)).toBe(true); expect(await checkPassword(sys, user.id, password())).toBe(false);
  const hash = getSecret(sys, `password:${user.id}`); expect(hash).not.toContain(pw);
  const raw = (sys.prepare('SELECT value FROM settings WHERE key = ?').get(`secret:password:${user.id}`) as {value:string}).value;
  expect(raw).not.toContain(hash); expect(raw).not.toContain(pw);
  expect(await passwordHash(pw)).not.toBe(await passwordHash(pw));
  for (const url of ['/api/me/password','/api/me/sign-in-methods','/api/auth/config']) { const r = await call('GET', url); expect(r.statusCode).toBe(200); expect(r.body).not.toContain(pw); expect(r.body).not.toContain(hash); }
});
it('signs in to the same personal library, normalises email, records the device and constrains return paths', async () => {
  const pw = password(); await call('PUT', '/api/me/password', { password: pw });
  const response = await login('  OWNER@password.test  ', pw, { returnTo: '//elsewhere.test' });
  expect(response.statusCode).toBe(200); expect(response.json().returnTo).toBe('/');
  const session = sessionFrom(response);
  expect((await call('GET','/api/me',undefined,session)).json().user.email).toBe(user.email);
  expect((await call('GET','/api/photos',undefined,session)).statusCode).toBe(200);
  const activity = (await call('GET','/api/me/security',undefined,session)).json(); expect(activity.sessions.some((s:any)=>s.current && s.ip)).toBe(true);
});
it('gives the same error for wrong, unknown, disabled and password-less accounts and creates no session', async () => {
  const pw = password(); await call('PUT','/api/me/password',{password:pw});
  const before = (sys.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n;
  const wrong = await login(user.email, password()), unknown = await login('unknown@password.test', pw);
  expect((sys.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n).toBe(before);
  updateUser(sys, user.id, {disabled:true}); const disabled = await login(user.email,pw); updateUser(sys,user.id,{disabled:false});
  savePasswordHash(sys,user.id,''); const unset = await login(user.email,pw);
  for (const r of [wrong,unknown,disabled,unset]) { expect(r.statusCode).toBe(401); expect(r.json()).toEqual(wrong.json()); expect(r.headers['set-cookie']).toBeUndefined(); }
  expect((sys.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n).toBe(0);
});
it('defaults off, can be enabled/disabled by an administrator, and refuses direct API login/enrolment when off', async () => {
  saveAuth(sys,{...loadAuth(sys),enabled:false,password:undefined});
  expect((await env.app.inject('/api/public/auth')).json().accountPassword).toBe(false);
  expect((await call('PUT','/api/auth/config',{password:true})).statusCode).toBe(200);
  const pw=password(); expect((await call('PUT','/api/me/password',{password:pw})).statusCode).toBe(200);
  expect((await call('PUT','/api/auth/config',{password:false})).statusCode).toBe(200);
  expect((await env.app.inject('/api/public/auth')).json().accountPassword).toBe(false);
  expect((await login(user.email,pw)).statusCode).toBe(404);
  expect((await call('PUT','/api/me/password',{password:password()})).statusCode).toBe(403);
  expect(hasPassword(sys,user.id)).toBe(true);
});
it('does not allow switching off the only sign-in method while personal sign-in is required', async () => {
  await call('PUT','/api/me/password',{password:password()});
  expect((await call('PUT','/api/auth/config',{password:false})).statusCode).toBe(400);
  expect(loadAuth(sys).password).toBe(true);
});
it('blocks members from changing the server setting', async () => {
  const member=resolveUser(sys,{provider:'email',sub:'member@password.test',email:'member@password.test',emailVerified:true,name:'Member'},true)!;
  expect((await call('PUT','/api/auth/config',{password:false},createSession(sys,member.id))).statusCode).toBe(403);
});
it('rejects short, huge and non-string passwords without storing them', async () => {
  for(const value of ['short','x'.repeat(257),null,123,{},[]]) expect((await call('PUT','/api/me/password',{password:value})).statusCode).toBe(400);
  expect(hasPassword(sys,user.id)).toBe(false);
});
it('requires current credentials for an old session, revokes other sessions and preserves the current one on change', async () => {
  const pw=password(); await call('PUT','/api/me/password',{password:pw});
  const other=createSession(sys,user.id); sys.prepare('UPDATE sessions SET created = ?').run(new Date(Date.now()-3600_000).toISOString());
  const next=password(); expect((await call('PUT','/api/me/password',{password:next})).statusCode).toBe(403);
  expect((await call('PUT','/api/me/password',{password:next,currentPassword:pw})).statusCode).toBe(200);
  expect((await call('GET','/api/photos',undefined,token)).statusCode).toBe(200);
  expect((await call('GET','/api/photos',undefined,other)).statusCode).toBe(401);
  expect((await login(user.email,pw)).statusCode).toBe(401); expect((await login(user.email,next)).statusCode).toBe(200);
});
it('rate limits guessing by account across addresses and by address across accounts', async () => {
  const pw=password(); await call('PUT','/api/me/password',{password:pw});
  for(let i=0;i<10;i++) expect((await login(user.email,password(),{},`10.0.0.${i+1}`)).statusCode).toBe(401);
  expect((await login(user.email,pw,{},'10.1.0.1')).statusCode).toBe(429);
  for(let i=0;i<20;i++) expect((await login(`unknown${i}@password.test`,pw,{},'10.2.0.1')).statusCode).toBe(401);
  expect((await login('fresh@password.test',pw,{},'10.2.0.1')).statusCode).toBe(429);
});
it('never treats password sign-in as a second factor', async () => {
  const pw=password(); await call('PUT','/api/me/password',{password:pw});
  const sid=crypto.createHash('sha256').update(token).digest('hex');const setup=beginTotp(sys,user,sid);expect(confirmTotp(sys,user.id,sid,totpCode(setup.secret))).not.toBeNull();
  const response=await login(user.email,pw), fresh=sessionFrom(response);
  expect((await call('GET','/api/photos',undefined,fresh)).statusCode).toBe(403);
  expect((await call('GET','/api/me',undefined,fresh)).json().mfa).toMatchObject({required:true,verified:false});
  expect((await call('PUT','/api/me/password',{password:password()},fresh)).statusCode).toBe(403);
});
it('creates no anonymous signup route and respects cross-site request protection', async () => {
  expect((await env.app.inject({method:'PUT',url:'/api/me/password',payload:{password:password()}})).statusCode).toBe(401);
  expect((await env.app.inject({method:'POST',url:'/api/public/auth/password',headers:{origin:'https://elsewhere.test'},payload:{email:user.email,password:password()}})).statusCode).toBe(403);
});
it('supports initial owner setup without email or an external provider and does not enable access protection prematurely', async () => {
  await env.app.close(); cleanup(env); env=makeEnv();sys=(env.app as any).frames.sys;
  expect((await call('PUT','/api/auth/config',{password:true})).statusCode).toBe(200);
  expect((await call('PUT','/api/auth/config',{enabled:true})).statusCode).toBe(400);
  const pw=password();const setup=await call('PUT','/api/me/password',{email:'first@password.test',password:pw}); expect(setup.statusCode).toBe(200);token=sessionFrom(setup);
  expect(loadAuth(sys).enabled).toBe(false); expect((await call('GET','/api/me/password')).json()).toMatchObject({hasPassword:true,bootstrap:false});
  expect((await call('PUT','/api/auth/config',{enabled:true})).statusCode).toBe(200);
  expect((await env.app.inject('/api/photos')).statusCode).toBe(401);
  expect((await login('first@password.test',pw)).statusCode).toBe(200);
});
it('removes password secrets from backup copies and when deleting an account', async () => {
  await call('PUT','/api/me/password',{password:password()}); const copy=path.join(env.tmp,'copy.db'); await sys.backup(copy);scrubCopy(copy,true); const restored=new Database(copy);expect(restored.prepare("SELECT 1 FROM settings WHERE key LIKE 'secret:password:%'").get()).toBeUndefined();restored.close();
  deleteUserRow(sys,user.id);expect(getSecret(sys,`password:${user.id}`)).toBe('');
});

it('applies the configured human check before accepting a password', async () => {
  const pw=password();await call('PUT','/api/me/password',{password:pw});
  vi.stubEnv('TURNSTILE_DELAY_SECONDS','0');
  saveTurnstile(sys,{enabled:true,siteKey:'local-site',secret:'local-check',signin:true});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:false,'error-codes':['invalid-input-response']}),{status:200})));
  expect((await login(user.email,pw,{turnstile:'rejected'})).statusCode).toBe(400);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true}),{status:200})));
  expect((await login(user.email,pw,{turnstile:'accepted'})).statusCode).toBe(200);
});
it('cannot enrol or authenticate an emergency administrator through personal passwords', async () => {
  const emergency=resolveUser(sys,{provider:'emergency',sub:'temporary',email:'temporary@password.test',emailVerified:true,name:'Temporary'},true)!;
  const emergencyToken=createSession(sys,emergency.id);const pw=password();savePasswordHash(sys,emergency.id,await passwordHash(pw));
  expect((await call('PUT','/api/me/password',{password:password()},emergencyToken)).statusCode).toBe(401);
  expect((await login(emergency.email,pw)).statusCode).toBe(401);
});
it('can retain an enrolled owner password when retiring an external provider', async () => {
  await call('PUT','/api/me/password',{password:password()});
  saveAuth(sys,{...loadAuth(sys),enabled:false,providers:[{id:'github',type:'github',name:'GitHub',clientId:'local'}],testedBy:{provider:'github',sub:'old',email:user.email,emailVerified:true,name:user.name}});
  expect((await call('PUT','/api/auth/config',{providers:[],enabled:true})).statusCode).toBe(200);
  expect(loadAuth(sys).testedBy?.provider).toBe('password');
});
