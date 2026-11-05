import { signupsOn } from './users.js';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { getSetting, setSetting } from './db.js';
import { loadAuth } from './auth.js';
import { loadTunnel } from './tunnel.js';

/**
 * The privacy policy page (/privacy), reachable without signing in so that people can read it before they do.
 * It describes what this software does with data, filled in with this instance's own facts (which sign-in providers
 * are set up, whether a tunnel is on, how long sessions last). The person running the server adds their name and a
 * contact; they are the one responsible for how it is used.
 */
export type PrivacyInfo = { operator: string; contact: string; extra: string };
const EMPTY: PrivacyInfo = { operator: '', contact: '', extra: '' };
export const loadPrivacy = (sys: Ctx['sys']): PrivacyInfo => ({ ...EMPTY, ...getSetting<Partial<PrivacyInfo>>(sys, 'privacy', {}) });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const para = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 14;

export function renderPrivacy(sys: Ctx['sys'], opts: { signups: boolean }): string {
  const info = loadPrivacy(sys);
  const auth = loadAuth(sys);
  const providers = auth.providers.map((p) => p.name).filter(Boolean);
  const tunnel = loadTunnel(sys).enabled;
  const who = info.operator ? `<strong>${esc(info.operator)}</strong>` : 'the person who runs this server';
  const contact = info.contact ? `You can reach them at ${esc(info.contact)}.` : 'Ask them directly: no contact address has been set up yet.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" type="image/svg+xml" href="/icon.svg"><title>Privacy · Frames</title><style>
  body{margin:0;background:#0d0d0d;color:#d8d5cf;font:16px/1.65 system-ui,sans-serif}
  main{max-width:720px;margin:0 auto;padding:48px 24px 80px}h1{font:400 44px/1.1 Georgia,serif;color:#efede8;margin:0 0 6px}
  h2{font:400 22px/1.3 Georgia,serif;color:#efede8;margin:34px 0 6px}p,li{margin:0 0 12px}ul{padding-left:22px;margin:0 0 12px}a{color:#efede8}
  .m{color:#8f8c86;font-size:14px}</style></head><body><main>
  <h1>Privacy</h1>
  <p class="m">What this Frames does with your information. Frames is software for keeping photographs. It is run by ${who}, who is responsible for this server. ${contact}</p>

  <h2>What is kept about you</h2>
  <ul>
    <li><strong>Your account</strong>: the name, email address and account id your sign-in provider${providers.length ? ` (${esc(providers.join(', '))})` : ''} gives Frames, your role (administrator or member), and when you last signed in. If the shared password is used, no personal details are kept.</li>
    <li><strong>A sign-in cookie</strong>: one cookie that keeps you signed in for ${SESSION_DAYS} days of use. Only a scrambled (hashed) copy is stored on the server. There are no tracking cookies, no analytics and no advertising.</li>
    <li><strong>Your library</strong>: the photographs you upload or sync, previews made from them, and everything you add: titles, descriptions, tags, reviews and ratings, notes, collections, share links and settings. The photographs in a library folder on the server are only ever read, never changed.</li>
    <li><strong>Secrets you enter</strong>, such as an AI key or a cloud account connection: stored on the server, never shown again, and left out of backups.</li>
  </ul>

  <h2>Who can see it</h2>
  <ul>
    <li><strong>Only you</strong>, inside the app: each person has their own library, and nobody else who signs in can see or reach it.</li>
    <li><strong>Administrators</strong> can see the list of people (names, emails, roles, how much space each uses) and can switch off or delete an account. They do not browse your photographs in the app. Be aware that whoever runs the server can read its files, including yours, in the same way they could read any file on their own computer.</li>
    <li><strong>Anyone you give a share link to</strong> can see exactly what that link shows, until it expires or you turn it off. <strong>Anyone on the internet</strong> can see a portfolio you publish.</li>
  </ul>

  <h2>Who else receives information</h2>
  <ul>
    <li><strong>Your sign-in provider</strong> learns that you signed in to this server.</li>
    <li>If you turn on <strong>AI analysis</strong>, small previews of your photographs (up to 1024 pixels) are sent to the AI service you choose, which may keep them under its own terms. Nothing is sent unless you set one up and confirm it. An AI on your own network sends nothing outside it.</li>
    <li>If you connect <strong>Google Drive, Dropbox or OneDrive</strong>, Frames reads your files from that service (read-only) using the access you grant.</li>
    ${tunnel ? '<li>This server is reached through a <strong>Cloudflare tunnel</strong>, so Cloudflare carries your traffic to it.</li>' : ''}
    <li>The pages load their typefaces from <strong>Google Fonts</strong>, so your browser contacts Google for them.</li>
  </ul>

  <h2>How long it is kept</h2>
  <ul>
    <li>Your library stays until you delete it. Sign-in sessions end after ${SESSION_DAYS} days without use.</li>
    <li>The server keeps a daily backup of each library and of the list of people, the last seven days. After you delete your data, copies in those backups disappear as they rotate out, within a week.</li>
  </ul>

  <h2>Your choices</h2>
  <ul>
    <li><strong>Delete everything</strong>: in Settings, Your data, press Delete my data. Your account, photographs held by Frames, previews, compositions, share links, settings and saved connections are erased and you are signed out. An administrator can do the same for an account on request. Folders that the server provides as read-only libraries are not Frames' to delete: ask the person who runs the server to remove them.</li>
    <li><strong>Turn off</strong> sharing at any time by deleting a share link or switching off a portfolio.</li>
    <li>${opts.signups ? 'Anyone the sign-in list allows can create an account on their first sign-in.' : 'New accounts are switched off: only people added by an administrator can sign in.'}</li>
  </ul>
  ${info.extra.trim() ? `<h2>From the person who runs this server</h2>${para(info.extra)}` : ''}
  <p class="m" style="margin-top:36px">This page describes what the software does. It is not legal advice, and the person running the server should check it against the rules that apply to them.</p>
  <p><a href="/">Back to Frames</a></p>
  </main></body></html>`;
}

export function registerPrivacy(app: FastifyInstance, x: Ctx) {
  app.get('/privacy', async (_req, rep) => rep.type('text/html').header('Cache-Control', 'no-cache').send(renderPrivacy(x.sys, { signups: signupsOn(x.sys, x.cfg.allowSignups !== false) })));

  // Administrators fill in who runs the server. Plain text only, length-limited.
  app.get('/api/admin/privacy', async () => loadPrivacy(x.sys));
  app.put('/api/admin/privacy', async (req) => {
    const b = (req.body ?? {}) as Row;
    const cur = loadPrivacy(x.sys);
    const cut = (v: unknown, max: number, d: string) => (typeof v === 'string' ? v.trim().slice(0, max) : d);
    const next: PrivacyInfo = { operator: cut(b.operator, 120, cur.operator), contact: cut(b.contact, 200, cur.contact), extra: cut(b.extra, 4000, cur.extra) };
    setSetting(x.sys, 'privacy', next);
    return next;
  });
}
