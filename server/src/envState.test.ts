import { afterEach, describe, expect, it } from 'vitest';
import { applyEnvConfig, buildEnvFile, snapshot } from './envConfig.js';
import { getSetting, setSetting } from './db.js';
import { cleanup, makeEnv, type Env } from './testutil.js';
process.env.CLOUDFLARE_API_BASE = 'http://127.0.0.1:9';

/** What the env file leaves out: things Frames records as it runs, which are not settings and would only ever show as a difference. */
const envs: Env[] = [];
const mk = () => { const e = makeEnv(); envs.push(e); return e; };
const sysOf = (e: Env) => (e.app as any).frames.sys;
const ownerOf = (e: Env) => (e.app as any).frames.tenants.owner().db;
const used: string[] = [];
afterEach(() => { for (const e of envs.splice(0)) { e.app.close(); cleanup(e); } for (const k of used.splice(0)) delete process.env[k]; });

describe('env export and import', () => {
  it('carries the choices in the tunnel but not when it last ran or what went wrong, and none of the counters', () => {
    const e = mk(); const sys = sysOf(e);
    setSetting(sys, 'tunnel', { enabled: true, tunnelName: 'Frames', appliedAt: '2026-11-10T01:00:00Z', error: 'boom', accessNote: 'n', dns: { a: { zoneId: 'z', recordId: 'r' } }, protectApplied: true });
    setSetting(sys, 'welcomed', true); setSetting(sys, 'shareKey', 'k'); setSetting(sys, 'aiUsage', { m: '2026-11', n: 3 }); setSetting(sys, 'batchesDone', [1]);
    const snap = snapshot(sys);
    expect(snap.tunnel).toEqual({ enabled: true, tunnelName: 'Frames' });
    for (const k of ['welcomed', 'shareKey', 'aiUsage', 'batchesDone']) expect(snap).not.toHaveProperty(k);
    const file = buildEnvFile(sys, ownerOf(e));
    expect(file).not.toMatch(/appliedAt|tunnel__error|shareKey/);
    expect(file).toMatch(/FRAMES_SYSTEM__tunnel__enabled/);
  });
  it('applying a file keeps what Frames had recorded in the same setting', () => {
    const e = mk(); const sys = sysOf(e);
    setSetting(sys, 'tunnel', { enabled: false, appliedAt: '2026-11-10T01:00:00Z', error: null });
    process.env.FRAMES_SYSTEM__tunnel__enabled = 'true'; used.push('FRAMES_SYSTEM__tunnel__enabled');
    applyEnvConfig(sys, ownerOf(e));
    expect(getSetting<any>(sys, 'tunnel', {})).toMatchObject({ enabled: true, appliedAt: '2026-11-10T01:00:00Z' });
  });
  it('ignores recorded state that an old file still holds', () => {
    const e = mk(); const sys = sysOf(e);
    process.env.FRAMES_SYSTEM__tunnel__appliedAt = '2020-01-01T00:00:00Z'; used.push('FRAMES_SYSTEM__tunnel__appliedAt');
    process.env.FRAMES_SYSTEM__tunnel__enabled = 'true'; used.push('FRAMES_SYSTEM__tunnel__enabled');
    applyEnvConfig(sys, ownerOf(e));
    expect(getSetting<any>(sys, 'tunnel', {})).toMatchObject({ enabled: true });
    expect(getSetting<any>(sys, 'tunnel', {}).appliedAt ?? null).toBeNull();
  });
});
