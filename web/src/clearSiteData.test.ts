import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSiteData } from './clearSiteData';

afterEach(() => vi.unstubAllGlobals());
const storage = () => ({ clear: vi.fn() });

describe('browser site-data reset', () => {
  it('clears preferences, caches, workers and databases after the reset response', async () => {
    const local = storage(), session = storage(), unregister = vi.fn().mockResolvedValue(true);
    const caches = { keys: vi.fn().mockResolvedValue(['old-assets', 'photos']), delete: vi.fn().mockResolvedValue(true) };
    const indexedDB = {
      databases: vi.fn().mockResolvedValue([{ name: 'frames' }, {}]),
      deleteDatabase: vi.fn(() => {
        const request = { onsuccess: null as null | (() => void), onerror: null, onblocked: null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }),
    };
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('window', { caches, indexedDB });
    vi.stubGlobal('localStorage', local); vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('caches', caches); vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } });
    await clearSiteData();
    expect(fetch).toHaveBeenCalledWith('/auth/logout?clearSiteData=1', { method: 'POST', cache: 'no-store' });
    expect(local.clear).toHaveBeenCalledOnce(); expect(session.clear).toHaveBeenCalledOnce();
    expect(caches.delete.mock.calls).toEqual([['old-assets'], ['photos']]);
    expect(unregister).toHaveBeenCalledOnce();
    expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('frames');
  });

  it('does not erase local state when the reset request fails', async () => {
    const local = storage();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); vi.stubGlobal('localStorage', local);
    await expect(clearSiteData()).rejects.toThrow('Could not clear site data');
    expect(local.clear).not.toHaveBeenCalled();
  });

  it('tolerates unavailable or restricted storage so the caller can reload', async () => {
    const local = { clear: vi.fn(() => { throw new Error('Storage unavailable'); }) }, session = storage();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal('window', {}); vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', local); vi.stubGlobal('sessionStorage', session);
    await expect(clearSiteData()).resolves.toBeUndefined();
    expect(session.clear).toHaveBeenCalledOnce();
  });
});
