import { afterEach, expect, it, vi } from 'vitest';
import { refreshAfterUpdate } from './appUpdate';
afterEach(() => vi.unstubAllGlobals());
function setup(previous: string | null, version = '1.2.0') {
  const reload = vi.fn(), remove = vi.fn().mockResolvedValue(true), unregister = vi.fn().mockResolvedValue(true);
  const local = { getItem: vi.fn(() => previous), setItem: vi.fn(), clear: vi.fn() };
  const caches = { keys: vi.fn().mockResolvedValue(['old-assets']), delete: remove };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version }) });
  vi.stubGlobal('localStorage', local); vi.stubGlobal('fetch', fetch); vi.stubGlobal('caches', caches);
  vi.stubGlobal('window', { caches, location: { href: 'http://localhost/library', reload } });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } });
  return { reload, remove, unregister, local, fetch };
}
it('refreshes changed deployments once without clearing preferences or signing out', async () => {
  const s = setup('1.1.0');
  expect(await refreshAfterUpdate()).toBe(true);
  expect(s.remove).toHaveBeenCalledWith('old-assets'); expect(s.unregister).toHaveBeenCalledOnce();
  expect(s.local.setItem).toHaveBeenCalledWith('frames-loaded-version', '1.2.0');
  expect(s.local.clear).not.toHaveBeenCalled(); expect(s.reload).toHaveBeenCalledOnce();
  expect(s.fetch).toHaveBeenCalledWith('http://localhost/library', expect.objectContaining({ cache: 'reload' }));
});
it('does not reload first visits, the same deployment or development', async () => {
  for (const [previous, version] of [[null, '1.2.0'], ['1.2.0', '1.2.0'], ['1.1.0', 'dev']] as const) {
    const s = setup(previous, version); expect(await refreshAfterUpdate()).toBe(false);
    expect(s.reload).not.toHaveBeenCalled(); expect(s.remove).not.toHaveBeenCalled();
  }
});
it('opens normally when offline or storage is blocked', async () => {
  const s = setup('1.1.0'); s.fetch.mockRejectedValueOnce(new Error('Offline'));
  expect(await refreshAfterUpdate()).toBe(false);
  s.local.getItem.mockImplementation(() => { throw new Error('Blocked'); });
  expect(await refreshAfterUpdate()).toBe(false); expect(s.reload).not.toHaveBeenCalled();
});
