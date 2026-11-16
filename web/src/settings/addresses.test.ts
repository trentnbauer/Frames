import { describe, expect, it } from 'vitest';
import { ROWS, parseAddress } from './addresses';
import { LIB, SRV } from './sections';

const at = (qs: string) => parseAddress(new URLSearchParams(qs));

describe('settings addresses', () => {
  it('sends every older address to where its settings live now', () => {
    expect(at('section=profile&tab=lib')).toEqual({ tab: 'lib', key: 'account', sub: 'profile' });
    expect(at('section=security')).toEqual({ tab: 'lib', key: 'account', sub: 'security' });
    expect(at('section=notifications')).toEqual({ tab: 'lib', key: 'account', sub: 'notifications' });
    expect(at('section=tags-subjects')).toEqual({ tab: 'lib', key: 'photo', sub: 'tags' });
    expect(at('section=metadata-xmp')).toEqual({ tab: 'lib', key: 'photo', sub: 'camera-xmp' });
    expect(at('section=ai&tab=lib')).toEqual({ tab: 'lib', key: 'photo', sub: 'ai' });
    expect(at('section=cloud')).toEqual({ tab: 'lib', key: 'storage', sub: 'storage' });
    expect(at('section=data&tab=lib')).toEqual({ tab: 'lib', key: 'storage', sub: 'your-data' });
    expect(at('section=reviews')).toEqual({ tab: 'lib', key: 'reviews', sub: 'schedule' });
    expect(at('cloud=connected')).toEqual({ tab: 'lib', key: 'storage', sub: 'storage' });
  });
  it('keeps a tab named in the address, and the server addresses', () => {
    expect(at('tab=lib&section=reviews&sub=clean-up')).toEqual({ tab: 'lib', key: 'reviews', sub: 'clean-up' });
    expect(at('tab=srv&section=folders')).toEqual({ tab: 'srv', key: 'folders', sub: 'local' });
    expect(at('section=access')).toEqual({ tab: 'srv', key: 'access', sub: 'signin' });
    expect(at('section=people')).toEqual({ tab: 'srv', key: 'access', sub: 'members' });
    expect(at('section=cloudflare-tunnel')).toEqual({ tab: 'srv', key: 'network', sub: 'tunnel' });
    expect(at('section=email')).toEqual({ tab: 'srv', key: 'network', sub: 'email' });
    expect(at('section=updates-system')).toEqual({ tab: 'srv', key: 'system', sub: 'updates' });
    expect(at('section=env-file')).toEqual({ tab: 'srv', key: 'system', sub: 'environment' });
    expect(at('section=storage-processing')).toEqual({ tab: 'srv', key: 'system', sub: 'processing' });
    expect(at('tab=srv&section=folders&sub=cloud')).toEqual({ tab: 'srv', key: 'folders', sub: 'cloud' });
    expect(at('tab=srv&section=system&sub=environment')).toEqual({ tab: 'srv', key: 'system', sub: 'environment' });
  });
  it('lists every searchable setting in a section and tab that exists', () => {
    const defs = [...LIB, ...SRV];
    for (const r of ROWS) {
      const def = defs.find((d) => d.tab === r.tab && d.key === r.sec);
      expect(def, `${r.id} is in ${r.tab}:${r.sec}`).toBeTruthy();
      if (r.sub) expect(def!.tabs?.map((t) => t.key), `${r.id} is on ${r.sec}/${r.sub}`).toContain(r.sub);
      if (def!.tabs) expect(r.sub, `${r.id} names its tab`).toBeTruthy();
    }
  });
  it('finds moved and renamed settings under their new names', () => {
    const find = (id: string) => ROWS.find((r) => r.id === id)!;
    expect(find('userQuota')).toMatchObject({ tab: 'srv', sec: 'folders', sub: 'limits' });
    expect(find('remind')).toMatchObject({ sec: 'reviews', sub: 'schedule', label: 'Email me when photos are due' });
    expect(find('commHome')).toMatchObject({ sec: 'app' });
    expect(find('sensPf')).toMatchObject({ sec: 'portfolio' });
    expect(find('stCache')).toMatchObject({ sec: 'storage', sub: 'storage' });
    expect(find('suggested')).toMatchObject({ sec: 'reviews', sub: 'clean-up', label: 'Waiting for you' });
    expect(ROWS.find((r) => r.id === 'welcomeTour')).toBeUndefined();
    expect(find('signup')).toMatchObject({ tab: 'srv', sec: 'access', sub: 'members' });
    expect(find('envExport')).toMatchObject({ tab: 'srv', sec: 'system', sub: 'environment' });
    expect(find('cacheMax')).toMatchObject({ tab: 'srv', sec: 'folders', sub: 'previews' });
    expect(find('rawMode')).toMatchObject({ tab: 'srv', sec: 'system', sub: 'processing' });
  });
});
