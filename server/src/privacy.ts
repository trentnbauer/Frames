import { signupsOn } from './users.js';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { getSetting, setSetting } from './db.js';
import { loadAuth, sessionDays } from './auth.js';
import { policyOf } from './policy.js';
import { loadTunnel } from './tunnel.js';

/**
 * The two policies everyone can read without signing in: the privacy page (/privacy) and the terms (/terms, shown by the
 * app). Both are lists of sections, a heading and some text. The text Frames writes describes what this software does,
 * filled in with this server's own facts (which sign-in methods are set up, whether a tunnel is on, how long sessions
 * and backups last). The administrator can add their name and a contact, or replace either policy with their own sections
 * (Settings, Server, Policies); an empty list goes back to the text Frames writes.
 *
 * Section text is plain: blank lines separate paragraphs, lines starting with "- " are bullets, **bold** is bold.
 */
export type Section = { h: string; p: string };
export type PrivacyInfo = { operator: string; contact: string; extra: string };
const EMPTY: PrivacyInfo = { operator: '', contact: '', extra: '' };
export const loadPrivacy = (sys: Ctx['sys']): PrivacyInfo => ({ ...EMPTY, ...getSetting<Partial<PrivacyInfo>>(sys, 'privacy', {}) });
/** The administrator's own sections, or null while Frames' own text is shown. */
export const loadCustom = (sys: Ctx['sys'], key: 'privacySections' | 'termsSections'): Section[] | null => {
  const v = getSetting<Section[] | null>(sys, key, null);
  return Array.isArray(v) && v.length ? v : null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
/** Section text as HTML: paragraphs, bullets and bold. Everything is escaped first, so it can only ever be text. */
export function markup(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; } };
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    const endPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    for (const l of lines) {
      if (l.startsWith('- ')) { endPara(); list.push(l.slice(2)); } else { flush(); para.push(l); }
    }
    endPara(); flush();
  }
  return out.join('');
}

/** What Frames says about privacy, true to how this server is set up. */
export function defaultPrivacy(sys: Ctx['sys'], opts: { signups: boolean }): Section[] {
  const auth = loadAuth(sys);
  const pol = policyOf(sys);
  const providers = auth.providers.map((p) => p.name).filter(Boolean);
  const tunnel = loadTunnel(sys).enabled;
  const days = sessionDays();
  const backups = pol.backupAuto
    ? `The server keeps a backup of each library and of the list of people every ${pol.backupEveryDays === 1 ? 'day' : `${pol.backupEveryDays} days`}, the last ${pol.backupKeep}. After you delete your data, copies in those backups disappear as they rotate out, within ${pol.backupEveryDays * pol.backupKeep} days. Photographs held only by the server are not in backups.`
    : 'This server is not set to make backups automatically. An administrator can still make one by hand.';
  return [
    { h: 'What is kept about you', p: [
      `- **Your account**: the name, email address and account id you sign in with${providers.length ? ` (a provider such as ${providers.join(', ')} gives Frames these)` : ''}, your role (administrator, member or guest), and when you last signed in. If the shared password is used, no personal details are kept.`,
      '- **Emailed codes and passkeys**: a sign-in code is kept only as a scrambled copy and works for ten minutes, once. A passkey stores a public key and the name you gave it; the secret part never leaves your device, and nothing about your face or fingerprint is sent.',
      `- **A sign-in cookie**: one cookie that keeps you signed in for ${days} days of use. Only a scrambled (hashed) copy is stored on the server. There are no tracking cookies, no analytics and no advertising.`,
      '- **Your library**: the photographs you upload or sync, previews made from them, and everything you add: titles, descriptions, tags, places, reviews and ratings, notes, compositions, share links and settings. The photographs in a library folder on the server are only ever read, never changed.',
      '- **Guest accounts**: someone who opens a share link may give a name, or make a free guest account. A guest account keeps their name, email and the share links they opened, and has no library.',
      '- **Secrets you enter**, such as an AI key or a cloud account connection: stored on the server, never shown again, and left out of backups.',
      '- **The server log and the email log**: the log records what the server did (errors, sign-ins, jobs) and administrators can read it. The email log keeps 30 days of who an email went to and its subject, never what it said.',
    ].join('\n') },
    { h: 'Who can see it', p: [
      '- **Only you**, inside the app: each person has their own library, and nobody else who signs in can see or reach it.',
      '- **Administrators** can see the list of people (names, emails, roles, how much space each uses) and can switch off or delete an account. They do not browse your photographs in the app. Whoever runs the server can read its files, including yours, in the same way they could read any file on their own computer.',
      '- **Anyone you give a share link to** can see exactly what that link shows, until it expires or you turn it off. Where a photograph has a place, a link and a portfolio only show it as precisely as you chose (exact, suburb or city). **Anyone on the internet** can see a portfolio you publish.',
      '- **Other members**, only if you opt in to community review: they see your photographs without your name and rate them. Photographs tagged nudity, violence or adult are never shown.',
    ].join('\n') },
    { h: 'Who else receives information', p: [
      '- **Your sign-in provider** learns that you signed in to this server.',
      '- **The mail service** this server uses (set by the person who runs it) carries the sign-in codes and notices it sends you.',
      '- If you turn on **AI analysis**, small previews of your photographs (up to 1024 pixels) are sent to the AI service you choose, which may keep them under its own terms. Nothing is sent unless you set one up and confirm it. An AI on your own network sends nothing outside it.',
      '- If you connect **Google Drive, Dropbox or OneDrive**, Frames reads your files from that service (read-only) using the access you grant.',
      ...(tunnel ? ['- This server is reached through a **Cloudflare tunnel**, so Cloudflare carries your traffic to it.'] : []),
      "- If you open the **map** to place a pin on a photograph, this server fetches map tiles and place searches from **OpenStreetMap** for you. OpenStreetMap sees this server's address and the area you look at or the place you search for, never your browser. Nothing is fetched until you open a map.",
      '- The pages load their typefaces from **Google Fonts**, so your browser contacts Google for them.',
    ].join('\n') },
    { h: 'How long it is kept', p: [
      `- Your library stays until you delete it. Sign-in sessions end after ${days} days without use.`,
      `- ${backups}`,
    ].join('\n') },
    { h: 'Your choices', p: [
      '- **Delete everything**: in Settings, Your data, press Delete my data. Your account, photographs held by Frames, previews, compositions, share links, settings and saved connections are removed.',
      '- **Turn off** sharing at any time by deleting a share link or switching off a portfolio.',
      `- ${opts.signups ? 'Anyone the sign-in list allows can create an account on their first sign-in.' : 'New accounts are switched off: only people added by an administrator can sign in.'}`,
    ].join('\n') },
  ];
}

/** What Frames says as terms of use. */
export function defaultTerms(): Section[] {
  return [
    { h: 'Who runs this', p: 'This Frames is a private, self-hosted server run by its owner. It is not a company service. Frames is open-source software; the people who wrote it do not run or see this server.' },
    { h: 'Your account', p: 'You sign in with the methods the owner has turned on: a one-time code emailed to you, a passkey, or an account with a provider such as Google. Don’t share sign-in codes. The owner can switch off any account at any time.' },
    { h: 'Your photos', p: 'You keep all rights to the photos you upload. Frames only stores, resizes and shows them where you choose: your library, share links, community review or your portfolio. Frames never changes or deletes an original.' },
    { h: 'Sharing and guests', p: 'Share links show your photos to anyone who has the link (and its 4-digit PIN, if one is set), until it expires or you stop sharing. Guests can rate and suggest changes, with a name or a free guest account; they cannot download originals unless you allow it.' },
    { h: 'Community review', p: 'If you opt in, other members rate your photos anonymously. Photos tagged nudity, violence or adult are never shown. Reported photos are reviewed by an administrator and may be removed.' },
    { h: 'What’s not allowed', p: 'Uploading photos you don’t have the right to share, photos of people who haven’t agreed to be shared, or anything illegal. Harassing other members through reviews or notes.' },
    { h: 'AI features', p: 'If AI is turned on, photos and their details may be sent to the AI providers listed in Settings to describe, tag or search them. Private shoots can be kept to local AI only.' },
    { h: 'No guarantees', p: 'This server is run on a best-effort basis. Keep your own copies of anything important. Frames never deletes files in your connected cloud storage.' },
    { h: 'Changes', p: 'The owner can change these terms. The current ones are always on this page, and the owner is the one to ask about them.' },
  ];
}

export const privacyOf = (sys: Ctx['sys'], signups: boolean): Section[] => loadCustom(sys, 'privacySections') ?? defaultPrivacy(sys, { signups });
export const termsOf = (sys: Ctx['sys']): Section[] => loadCustom(sys, 'termsSections') ?? defaultTerms();

export function renderPrivacy(sys: Ctx['sys'], opts: { signups: boolean }): string {
  const info = loadPrivacy(sys);
  const who = info.operator ? `<strong>${esc(info.operator)}</strong>` : 'the person who runs this server';
  const contact = info.contact ? `You can reach them at ${esc(info.contact)}.` : 'Ask them directly: no contact address has been set up yet.';
  const body = privacyOf(sys, opts.signups).map((s) => `<h2>${esc(s.h)}</h2>${markup(s.p)}`).join('\n  ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" type="image/svg+xml" href="/icon.svg"><title>Privacy · Frames</title><style>
  body{margin:0;background:#0d0d0d;color:#d8d5cf;font:16px/1.65 system-ui,sans-serif}
  main{max-width:720px;margin:0 auto;padding:48px 24px 80px}h1{font:400 44px/1.1 Georgia,serif;color:#efede8;margin:0 0 6px}
  h2{font:400 22px/1.3 Georgia,serif;color:#efede8;margin:34px 0 6px}p,li{margin:0 0 12px}ul{padding-left:22px;margin:0 0 12px}a{color:#efede8}
  .m{color:#8f8c86;font-size:14px}</style></head><body><main>
  <h1>Privacy</h1>
  <p class="m">What this Frames does with your information. Frames is software for keeping photographs. It is run by ${who}, who is responsible for this server. ${contact}</p>
  ${body}
  ${info.extra.trim() ? `<h2>From the person who runs this server</h2>${markup(info.extra)}` : ''}
  <p class="m" style="margin-top:36px">This page describes what the software does. It is not legal advice, and the person running the server should check it against the rules that apply to them.</p>
  <p><a href="/">Back to Frames</a></p>
  </main></body></html>`;
}

const cleanSections = (v: unknown): Section[] | 'bad' => {
  if (!Array.isArray(v) || v.length > 40) return 'bad';
  const out: Section[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object' || typeof (s as Row).h !== 'string' || typeof (s as Row).p !== 'string') return 'bad';
    const h = ((s as Row).h as string).trim().slice(0, 120), p = ((s as Row).p as string).trim().slice(0, 6000);
    if (h || p) out.push({ h, p });
  }
  return out;
};

export function registerPrivacy(app: FastifyInstance, x: Ctx) {
  const signups = () => signupsOn(x.sys, x.cfg.allowSignups !== false);
  app.get('/privacy', async (_req, rep) => rep.type('text/html').header('Cache-Control', 'no-cache').send(renderPrivacy(x.sys, { signups: signups() })));
  // The terms, for the sign-up and terms screens. Under /api/public/auth so it stays reachable before signing in, like the rest of that group.
  app.get('/api/public/auth/terms', async () => ({ sections: termsOf(x.sys) }));

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

  // Settings, Server, Policies: read both policies as they stand and with Frames' own text, and replace either. An empty list goes back to Frames' text.
  app.get('/api/admin/policies', async () => ({
    terms: { sections: termsOf(x.sys), custom: !!loadCustom(x.sys, 'termsSections'), defaults: defaultTerms() },
    privacy: { sections: privacyOf(x.sys, signups()), custom: !!loadCustom(x.sys, 'privacySections'), defaults: defaultPrivacy(x.sys, { signups: signups() }) },
  }));
  app.put('/api/admin/policies/:which', async (req, rep) => {
    const which = String((req.params as Row).which);
    if (which !== 'terms' && which !== 'privacy') return rep.code(404).send({ error: 'Not found' });
    const s = cleanSections((req.body as Row | undefined)?.sections);
    if (s === 'bad') return rep.code(400).send({ error: 'Send a list of sections, each with a heading and some text.' });
    setSetting(x.sys, which === 'terms' ? 'termsSections' : 'privacySections', s);
    return { custom: s.length > 0 };
  });
}
