import { policyOf } from '../policy.js';
import { dirBytes } from '../cache.js';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { loadAuth, saveAuth } from '../auth.js';
import { clientOf, PROVIDERS } from '../cloud.js';
import type { Ctx, Row } from '../ctx.js';
import { checkCode, checkSmtp, footer, getSmtp, healthOf, issueCode, logCsv, logRows, retryFailed, saveSmtp, sendMail, smtpConfigured, smtpHealthy, smtpPassword } from '../email.js';
import { displayNameOf } from './profile.js';
import { getUser, type User } from '../users.js';
import { ensureOutbox, flushOutbox, remindersFor } from '../mailEvents.js';

/** What the screens need to know about how this server is set up, and the administrator's Email settings. */
export function registerSystem(app: FastifyInstance, x: Ctx) {
  const { sys, cfg, db } = x;
  const me = (req: any) => req.authUser as User;

  // For everyone signed in: which things are switched on. The front end hides or disables parts of the app from this.
  app.get('/api/config/status', async (req) => {
    const providers = PROVIDERS.filter((p) => !!clientOf(cfg, db, p.id).clientId).map((p) => p.id);
    const t = x.tenant();
    return {
      smtpHealthy: smtpHealthy(sys),
      storage: { local: !(cfg as { cloudOnly?: boolean }).cloudOnly && (t.cfg.libraries?.length ?? 0) > 0, cloud: providers.length > 0 },
      cloudProviders: providers,
      admin: me(req)?.role === 'admin',
    };
  });


  // ---------- Settings, Server, Storage & processing and Updates & system ----------
  const disk = (dir: string) => { try { const f = fs.statfsSync(dir); return { path: dir, total: f.blocks * f.bsize, free: f.bavail * f.bsize }; } catch { return { path: dir, total: 0, free: 0 }; } };
  app.get('/api/admin/system', async () => {
    const owner = x.tenants.owner();
    const all = x.tenants.all();
    const folder = owner.cfg.libraries?.[0] ?? owner.cfg.dataDir;
    const cacheBytes = all.reduce((n, t) => n + dirBytes(path.join(t.cfg.dataDir, 'derivatives')), 0);
    const checks = [
      { name: 'database', ok: (() => { try { return sys.pragma('integrity_check', { simple: true }) === 'ok'; } catch { return false; } })() },
      { name: 'library folder', ok: !!folder && fs.existsSync(folder) },
      { name: 'cache', ok: (() => { try { fs.accessSync(owner.cfg.dataDir, fs.constants.W_OK); return true; } catch { return false; } })() },
      { name: 'email', ok: !smtpConfigured(sys) || smtpHealthy(sys) },
    ];
    return { version: cfg.version ?? 'dev', image: process.env.FRAMES_IMAGE ?? 'ghcr.io/trentnbauer/frames', libraryDisk: disk(folder), dataDisk: disk(owner.cfg.dataDir), cache: { path: path.join(owner.cfg.dataDir, 'derivatives'), bytes: cacheBytes }, checks, libraries: all.length };
  });

  // Other members' photoshoots, read-only, when the administrator allows it (Settings, Server, Members). Names, dates and counts only:
  // the photographs themselves stay in their own library.
  app.get('/api/shoots/others', async () => {
    if (!policyOf(sys).membersSeeShoots) return { enabled: false, shoots: [] };
    const me = x.tenant().user.id;
    const out: { owner: string; id: number; name: string; dates: string; count: number; place: string }[] = [];
    for (const t of x.tenants.all()) {
      if (t.user.id === me || t.user.role === 'guest' || t.user.disabled) continue;
      try {
        const rows = t.db.prepare('SELECT s.id, s.name, s.place, s.imported_at, s.date_from, s.date_to, COUNT(p.id) n, MIN(p.captured_at) a, MAX(p.captured_at) b FROM shoots s LEFT JOIN photos p ON p.shoot_id = s.id AND p.missing = 0 GROUP BY s.id ORDER BY s.imported_at DESC LIMIT 100').all() as Row[];
        const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        for (const r of rows) {
          const from = r.date_from ?? r.a, to = r.date_to ?? r.b;
          out.push({ owner: (t.user.name || t.user.email || 'Someone').split(' ')[0], id: r.id, name: r.name, place: r.place, count: r.n, dates: from ? (!to || String(from).slice(0, 10) === String(to).slice(0, 10) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`) : fmt(r.imported_at) });
        }
      } catch { /* one person's library that cannot be read never hides the others */ }
    }
    return { enabled: true, shoots: out };
  });

  // ---------- Settings, Server, Email ----------
  const state = () => {
    const s = getSmtp(sys);
    const conf = loadAuth(sys);
    return { smtp: s, hasPassword: !!smtpPassword(sys), configured: smtpConfigured(sys), health: healthOf(sys), emailSignIn: !!conf.email, fromEnv: !!process.env.SMTP_HOST };
  };
  app.get('/api/admin/email', async () => state());
  app.put('/api/admin/email', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const err = saveSmtp(sys, b);
    if (err) return rep.code(400).send({ error: err });
    if (smtpConfigured(sys)) await checkSmtp(sys); // the health check runs on every change, so the answer is always about what is saved now
    const conf = loadAuth(sys);
    if (conf.email && !smtpHealthy(sys)) saveAuth(sys, { ...conf, email: conf.email }); // stays on: the sign-in page hides the option until it passes again
    return state();
  });
  app.post('/api/admin/email/check', async () => { await checkSmtp(sys); return state(); });
  app.post('/api/admin/email/test', async (req, rep) => {
    const to = String(((req.body ?? {}) as Row).to || me(req).email || '').trim();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(to)) return rep.code(400).send({ error: 'Enter an address to send the test to.' });
    const r = await sendMail(sys, { to, template: 'general', type: 'test', params: { ...footer(sys, displayNameOf(x.tenants.owner().db), x.baseUrl(req)), subject: 'Frames test email', preheader: 'Email is working.', eyebrow: 'Test', title: 'Email is working', name: me(req).name.split(' ')[0] || 'there', body: 'This is a test from Settings, Email. If you can read it, Frames can send mail.', button_label: 'Open Frames', button_url: `${x.baseUrl(req)}/`, fine_print: 'Sent because an administrator pressed Send test email.', image_url: '', image_alt: '', note: '', note_from: '' } });
    await checkSmtp(sys);
    return r.ok ? { ok: true } : rep.code(502).send({ error: r.error });
  });

  // Prove emailed-code sign-in works for this administrator, so that it can stand on its own.
  app.post('/api/admin/email/signin-test', async (req, rep) => {
    const u = me(req);
    const b = (req.body ?? {}) as Row;
    if (!smtpHealthy(sys)) return rep.code(400).send({ error: 'Email is not passing its check yet.' });
    if (!u.email) return rep.code(400).send({ error: 'Your account has no email address to send a code to.' });
    if (b.code === undefined) {
      const code = issueCode(sys, u.email);
      const r = await sendMail(sys, { to: u.email, template: 'code', type: 'code', params: { ...footer(sys, displayNameOf(x.tenants.owner().db), x.baseUrl(req)), name: u.name.split(' ')[0] || 'there', code, device: 'Settings', location: '', time: new Date().toUTCString() } });
      return r.ok ? { sent: true } : rep.code(502).send({ error: r.error });
    }
    if (checkCode(sys, u.email, b.code) !== 'ok') return rep.code(400).send({ error: 'That code is not right, or it has expired.' });
    const conf = loadAuth(sys);
    const user = getUser(sys, u.id)!;
    saveAuth(sys, { ...conf, testedBy: { provider: 'email', sub: user.email.toLowerCase(), email: user.email, emailVerified: true, name: user.name } });
    return { ok: true };
  });

  // The email log: the last 30 days, never the bodies.
  app.get('/api/admin/email/log', async (req) => {
    const s = String((req.query as Row).status ?? '');
    return { rows: logRows(sys, s === 'delivered' || s === 'failed' ? s : undefined) };
  });
  app.get('/api/admin/email/log.csv', async (_req, rep) => rep.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="frames-email-log.csv"').header('Cache-Control', 'no-store').send(logCsv(logRows(sys))));
  app.post('/api/admin/email/log/retry', async () => ({ sent: await retryFailed(sys) }));
}

/** Re-checks SMTP every ten minutes, and every minute sends what is due (held mail, reminders, the monthly summary). Never throws. */
export function startEmailHealth(x: Ctx, onClose: (fn: () => void) => void) {
  let n = 0;
  const t = setInterval(() => {
    try {
      n++;
      if (n % 10 === 0 && smtpConfigured(x.sys)) void checkSmtp(x.sys).catch(() => undefined);
      if (!smtpHealthy(x.sys)) return;
      ensureOutbox(x.sys);
      const base = (loadAuth(x.sys).publicUrl || '').replace(/\/+$/, '');
      if (base) for (const tenant of x.tenants.all()) { try { remindersFor(x, tenant, base); } catch (e) { console.error('Reminder failed for one person', (e as Error).message); } }
      void flushOutbox(x).catch(() => undefined);
    } catch (e) { console.error('Mail timer', (e as Error).message); }
  }, 60_000);
  t.unref();
  onClose(() => clearInterval(t));
}
