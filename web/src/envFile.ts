/**
 * Builds a .env file for the Docker stack from what is typed on the Deployment page. Pure functions, so the file is
 * exactly what the tests say it is: secrets are only ever in the browser, never sent to the server.
 */
export type Field = { key: string; label: string; kind: 'text' | 'secret' | 'bool'; help: string; group: string; placeholder?: string };
export type Values = Record<string, string>;

export const GROUPS = ['Sign-in', 'The server', 'Cloudflare tunnel'] as const;

export const FIELDS: Field[] = [
  { group: 'Sign-in', key: 'AUTH_DISABLE', label: 'No sign-in inside Frames', kind: 'bool', help: 'For one person behind something else that protects it (Cloudflare Access, a VPN). Anyone who can reach the port can use Frames.' },
  { group: 'Sign-in', key: 'AUTH_USER', label: 'Shared password: user name', kind: 'text', help: 'Optional. Only used with a shared password.', placeholder: 'frames' },
  { group: 'Sign-in', key: 'AUTH_PASSWORD', label: 'Shared password', kind: 'secret', help: 'Optional. A password cannot be read back, so type it again if you use one.' },
  { group: 'Sign-in', key: 'ALLOW_SIGNUPS', label: 'Let new people create an account', kind: 'bool', help: 'Off: only people an administrator added, or who already have an account, can sign in.' },
  { group: 'Sign-in', key: 'SESSION_DAYS', label: 'Days a sign-in lasts', kind: 'text', help: 'Default 14.', placeholder: '14' },
  { group: 'Sign-in', key: 'OIDC_ALLOW_HTTP', label: 'Allow an OpenID Connect server on plain http', kind: 'bool', help: 'Only on a network you trust.' },
  { group: 'The server', key: 'PHOTOS_DIR', label: 'Photo folder on the host', kind: 'text', help: 'Where your photographs are on the Docker host, mounted read-only at /library.', placeholder: '/srv/photos' },
  { group: 'The server', key: 'BIND_ADDRESS', label: 'Listen on', kind: 'text', help: '127.0.0.1 is this machine only; 0.0.0.0 is every network interface.', placeholder: '127.0.0.1' },
  { group: 'The server', key: 'PORT', label: 'Port on the host', kind: 'text', help: 'The port published on the host (it can differ from the container’s own port, 3000). Used by the compose files’ ports line. If your stack also lists this file under env_file:, write the port in the compose file instead: env_file only sets variables inside the container.', placeholder: '3000' },
  { group: 'The server', key: 'FRAMES_VERSION', label: 'Image version', kind: 'text', help: 'Pin a release such as 1.2.3, or leave empty for latest.', placeholder: 'latest' },
  { group: 'The server', key: 'MAX_UPLOAD_MB', label: 'Largest upload (MB)', kind: 'text', help: 'Default 2048.', placeholder: '2048' },
  { group: 'The server', key: 'TRUST_PROXY', label: 'Behind a reverse proxy', kind: 'bool', help: 'So share links rate-limit each visitor, not the proxy.' },
  { group: 'The server', key: 'ALLOWED_HOSTS', label: 'Public host names', kind: 'text', help: 'Only if a reverse proxy rewrites the Host header. Comma-separated.', placeholder: 'frames.example.com' },
  { group: 'Cloudflare tunnel', key: 'CLOUDFLARE_API_TOKEN', label: 'API token', kind: 'secret', help: 'Needs Account > Cloudflare Tunnel: Edit, Account > Access: Apps and Policies: Edit, Zone > DNS: Edit, Zone > Zone: Read. It cannot be read back, so paste it again.' },
  { group: 'Cloudflare tunnel', key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Account ID', kind: 'text', help: '32 letters and numbers, from the Cloudflare dashboard.' },
  { group: 'Cloudflare tunnel', key: 'TUNNEL_NAME', label: 'Tunnel name', kind: 'text', help: 'Default Frames.', placeholder: 'Frames' },
  { group: 'Cloudflare tunnel', key: 'APP_HOSTNAME', label: 'App address', kind: 'text', help: 'The app, behind Cloudflare Access. Needs the emails below.', placeholder: 'frames.example.com' },
  { group: 'Cloudflare tunnel', key: 'ACCESS_EMAILS', label: 'Emails Access lets in', kind: 'text', help: 'Comma-separated.', placeholder: 'me@example.com' },
  { group: 'Cloudflare tunnel', key: 'PORTFOLIO_HOSTNAME', label: 'Portfolio address', kind: 'text', help: 'Shows only the portfolio, public, no login.', placeholder: 'gallery.example.com' },
];

/** One KEY=value line, quoted only when it has to be so that Docker Compose reads back exactly what was typed. */
export function envLine(key: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${key} cannot contain a line break`);
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(value)) return `${key}=${value}`;
  if (!value.includes("'")) return `${key}='${value}'`; // single quotes: nothing inside is interpolated
  return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '$$$$')}"`;
}

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const EMAIL = /^[^\s@,]{1,64}@[^\s@,]{1,190}\.[^\s@,]{2,}$/;
const t = (v: Values, k: string) => (v[k] ?? '').trim();

/** Things that would make the stack not work, or work in a way the person would not expect. */
export function problems(v: Values): string[] {
  const out: string[] = [];
  const app = t(v, 'APP_HOSTNAME').toLowerCase(), pf = t(v, 'PORTFOLIO_HOSTNAME').toLowerCase();
  const emails = t(v, 'ACCESS_EMAILS').split(/[,\s;]+/).filter(Boolean);
  const tunnel = [app, pf, t(v, 'CLOUDFLARE_API_TOKEN'), t(v, 'CLOUDFLARE_ACCOUNT_ID'), emails.length ? 'x' : ''].some(Boolean);
  if (tunnel) {
    if (!t(v, 'CLOUDFLARE_API_TOKEN')) out.push('Cloudflare tunnel: the API token is empty. Paste it, or clear the other tunnel fields.');
    if (!/^[0-9a-f]{32}$/i.test(t(v, 'CLOUDFLARE_ACCOUNT_ID'))) out.push('Cloudflare tunnel: the account ID must be 32 letters and numbers.');
    if (!app && !pf) out.push('Cloudflare tunnel: set the app address and/or the portfolio address.');
    for (const [n, h] of [['App address', app], ['Portfolio address', pf]] as const) if (h && !HOST.test(h)) out.push(`${n} “${h}” is not a valid hostname.`);
    if (app && app === pf) out.push('The app address and the portfolio address must be different.');
    if (app && !emails.length) out.push('The app address needs at least one email for Cloudflare Access: it is never published without a login.');
    for (const e of emails) if (!EMAIL.test(e.toLowerCase())) out.push(`“${e}” is not an email address.`);
  }
  for (const k of ['SESSION_DAYS', 'MAX_UPLOAD_MB', 'PORT']) if (t(v, k) && !/^\d{1,6}$/.test(t(v, k))) out.push(`${k} must be a number.`);
  if (t(v, 'AUTH_PASSWORD') && !t(v, 'AUTH_USER')) out.push('A shared password works best with a user name too (default “frames” is used if empty).');
  for (const f of FIELDS) if (/[\r\n]/.test(v[f.key] ?? '')) out.push(`${f.label} cannot contain a line break.`);
  return [...new Set(out)];
}

/** The file. `mask` hides secret values, for showing on screen; the download never masks. Empty fields are left out. */
export function buildEnv(v: Values, opts: { mask?: boolean; version?: string; date?: Date } = {}): string {
  const lines = [
    `# Frames${opts.version ? ` ${opts.version}` : ''} settings, made on the Deployment page${opts.date ? ` on ${opts.date.toISOString().slice(0, 10)}` : ''}.`,
    '# Use it with the stack: docker compose --env-file frames.env up -d (or save it as .env), or Portainer: Stack, Environment variables, Load variables from .env file.',
    '# It holds secrets: keep it private and never commit it.',
  ];
  // A tunnel name on its own means nothing: it is only written when a tunnel is being set up.
  const tunnelInUse = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'APP_HOSTNAME', 'ACCESS_EMAILS', 'PORTFOLIO_HOSTNAME'].some((k) => t(v, k));
  for (const g of GROUPS) {
    const rows: string[] = [];
    for (const f of FIELDS.filter((x) => x.group === g)) {
      if (f.key === 'TUNNEL_NAME' && !tunnelInUse) continue;
      const raw = f.kind === 'bool' ? (v[f.key] === 'true' ? 'true' : v[f.key] === 'false' ? 'false' : '') : t(v, f.key);
      if (!raw) continue;
      rows.push(envLine(f.key, f.kind === 'secret' && opts.mask ? '********' : raw));
    }
    if (rows.length) lines.push('', `# ${g}`, ...rows);
  }
  return lines.join('\n') + '\n';
}
