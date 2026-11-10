import type { FastifyInstance } from 'fastify';
import { loadAuth, saveAuth } from '../auth.js';
import { clientOf, PROVIDERS } from '../cloud.js';
import type { Ctx, Row } from '../ctx.js';
import { checkCode, checkSmtp, footer, getSmtp, healthOf, issueCode, logCsv, logRows, retryFailed, saveSmtp, sendMail, smtpConfigured, smtpHealthy, smtpPassword } from '../email.js';
import { displayNameOf } from './profile.js';
import { getUser, type User } from '../users.js';

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

/** Re-checks SMTP every ten minutes, so the sign-in option follows the mail server's health. Never throws. */
export function startEmailHealth(x: Ctx, onClose: (fn: () => void) => void) {
  const t = setInterval(() => { if (smtpConfigured(x.sys)) void checkSmtp(x.sys).catch(() => undefined); }, 600_000);
  t.unref();
  onClose(() => clearInterval(t));
}
