import { describe, expect, it } from 'vitest';
import { buildEnv, envLine, problems } from './envFile';

const good = { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), APP_HOSTNAME: 'frames.example.com', ACCESS_EMAILS: 'me@example.com,you@example.com', PORTFOLIO_HOSTNAME: 'gallery.example.com' };

describe('one line of an .env file', () => {
  it('leaves plain values bare', () => {
    expect(envLine('A', 'frames.example.com')).toBe('A=frames.example.com');
    expect(envLine('A', 'me@example.com,you@example.com')).toBe('A=me@example.com,you@example.com');
    expect(envLine('A', '/srv/photos')).toBe('A=/srv/photos');
    expect(envLine('A', '')).toBe('A=');
  });
  it('quotes anything Docker Compose could misread, in single quotes so nothing inside is interpolated', () => {
    expect(envLine('A', 'two words')).toBe("A='two words'");
    expect(envLine('A', 'pa$$word#1')).toBe("A='pa$$word#1'");
    expect(envLine('A', 'a"b')).toBe("A='a\"b'");
  });
  it('falls back to double quotes, escaped, when the value has a single quote', () => {
    expect(envLine('A', "it's $x")).toBe('A="it\'s $$x"');
    expect(envLine('A', 'a\\b\'c"d')).toBe('A="a\\\\b\'c\\"d"');
  });
  it('refuses a line break, which would split the line', () => {
    expect(() => envLine('A', 'one\ntwo')).toThrow(/line break/);
  });
});

describe('the whole file', () => {
  it('has sections, only what was filled in, and explicit true or false for switches', () => {
    const f = buildEnv({ ...good, AUTH_DISABLE: 'true', ALLOW_SIGNUPS: 'false', HOST_PORT: '8080', TRUST_PROXY: '' }, { version: '1.2.3', date: new Date('2026-11-04T00:00:00Z') });
    expect(f).toContain('# Frames 1.2.3 settings, made on the Deployment page on 2026-11-04.');
    expect(f).toContain('# Sign-in\nAUTH_DISABLE=true\nALLOW_SIGNUPS=false');
    expect(f).toContain('# The server\nHOST_PORT=8080');
    expect(f).toContain('# Cloudflare tunnel\nCLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=' + 'a'.repeat(32) + '\nAPP_HOSTNAME=frames.example.com\nACCESS_EMAILS=me@example.com,you@example.com\nPORTFOLIO_HOSTNAME=gallery.example.com');
    expect(f).not.toContain('TRUST_PROXY');
    expect(f).not.toContain('TUNNEL_NAME=Studio');
    expect(f.endsWith('\n')).toBe(true);
  });
  it('hides secrets on screen but never in the file that is downloaded', () => {
    const v = { ...good, AUTH_PASSWORD: 'hunter2 and more' };
    const shown = buildEnv(v, { mask: true });
    expect(shown).not.toMatch(/tok\n|hunter2/);
    expect(shown).toContain("CLOUDFLARE_API_TOKEN='********'");
    expect(shown).toContain("AUTH_PASSWORD='********'");
    expect(buildEnv(v)).toContain('CLOUDFLARE_API_TOKEN=tok');
    expect(buildEnv(v)).toContain("AUTH_PASSWORD='hunter2 and more'");
  });
  it('leaves the tunnel name out unless a tunnel is being set up', () => {
    expect(buildEnv({ TUNNEL_NAME: 'Frames' })).not.toContain('TUNNEL_NAME');
    expect(buildEnv({ ...good, TUNNEL_NAME: 'Studio' })).toContain('TUNNEL_NAME=Studio');
  });
  it('is nearly empty when nothing is set', () => {
    expect(buildEnv({}).split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([]);
  });
});

describe('what would not work', () => {
  it('is quiet for a good setup, and for no tunnel at all', () => {
    expect(problems(good)).toEqual([]);
    expect(problems({})).toEqual([]);
    expect(problems({ ...good, APP_HOSTNAME: '', ACCESS_EMAILS: '' })).toEqual([]);
  });
  it('says what is missing, in plain words', () => {
    const p = (extra: Record<string, string>) => problems({ ...good, ...extra }).join(' | ');
    expect(p({ CLOUDFLARE_API_TOKEN: '' })).toMatch(/API token is empty/);
    expect(p({ CLOUDFLARE_ACCOUNT_ID: 'short' })).toMatch(/32 letters and numbers/);
    expect(p({ ACCESS_EMAILS: '' })).toMatch(/needs at least one email/);
    expect(p({ ACCESS_EMAILS: 'nope' })).toMatch(/not an email address/);
    expect(p({ APP_HOSTNAME: 'no_dots' })).toMatch(/not a valid hostname/);
    expect(p({ PORTFOLIO_HOSTNAME: 'frames.example.com' })).toMatch(/must be different/);
    expect(p({ HOST_PORT: 'eighty' })).toMatch(/HOST_PORT must be a number/);
    expect(p({ APP_HOSTNAME: '', PORTFOLIO_HOSTNAME: '' })).toMatch(/set the app address and\/or the portfolio address/);
  });
});
