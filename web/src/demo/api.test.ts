import { describe, expect, it, vi } from 'vitest';
import { demoApi, demoImage } from './api';

describe('GitHub Pages demo API', () => {
  it('serves synthetic photographs with production-compatible fields', async () => {
    const library = await demoApi<{ photos: { id: number; title: string; shootId: number }[]; count: number }>('/photos');
    expect(library.count).toBeGreaterThan(0);
    expect(library.photos[0].shootId).toBe(1);
    const photo = await demoApi<{ id: number; tags: unknown[]; reviews: unknown[] }>('/photos/1');
    expect(photo.id).toBe(1);
    expect(photo.tags.length).toBeGreaterThan(0);
    expect(demoImage(1)).toMatch(/^https:\/\/picsum\.photos\/id\/\d+\/480\/320$/);
    expect(demoImage(1, 'preview')).toMatch(/\/1600\/1067$/);
    expect(demoImage(1)).not.toBe(demoImage(2));
  });

  it('filters the same sample library by search and photoshoot', async () => {
    const all = await demoApi<{ count: number }>('/photos');
    const subset = await demoApi<{ count: number }>('/photos?shoot=2&q=golden');
    expect(subset.count).toBe(1);
    expect(all.count).toBeGreaterThan(subset.count);
  });

  it('updates frame choices in demo memory without touching a backend', async () => {
    const before = await demoApi<{ layout: { prints: { frame: { color: string } | null }[] } }>('/collections/1');
    const prints = structuredClone(before.layout.prints);
    const originalColor = prints[0].frame?.color;
    prints[0].frame = { ...prints[0].frame!, color: 'oak' };
    const changed = await demoApi<{ layout: { prints: { frame: { color: string } | null }[] } }>('/collections/1', {
      method: 'PATCH', body: { layout: { ...before.layout, mode: 'free', prints } },
    });
    expect(changed.layout.prints[0].frame?.color).toBe('oak');
    expect((await demoApi<typeof changed>('/collections/1')).layout.prints[0].frame?.color).toBe('oak');
    await demoApi('/collections/1', {
      method: 'PATCH', body: { layout: { ...before.layout, prints: before.layout.prints } },
    });
    expect((await demoApi<typeof changed>('/collections/1')).layout.prints[0].frame?.color).toBe(originalColor);
  });

  it('shows a multi-print, a landscape and a portrait composition, each framed one size up with a white mount', async () => {
    type P = { size: string; orientation: string; frame: { size: string; mat: string } | null; photoId: number };
    const all = await demoApi<{ layout: { prints: P[] } }[]>('/collections');
    expect(all.map(c => c.layout.prints.length)).toEqual([3, 1, 1]);
    const room = all[0] as unknown as { background: { w: number }; layout: { mode: string; bg: { mmPerPx: number } } };
    expect(room.background.w).toBe(2000);
    expect(room.layout.mode).toBe('free'); // kept where it was hung, above the sofa
    const right = Math.max(...all[0].layout.prints.map(p => (p as unknown as { x: number }).x));
    expect(right).toBeLessThan(2000 * room.layout.bg.mmPerPx);
    expect(all[1].layout.prints[0].orientation).toBe('landscape');
    expect(all[2].layout.prints[0].orientation).toBe('portrait');
    for (const p of all.flatMap(c => c.layout.prints)) {
      expect(p.frame?.mat).toBe('white');
      expect(p.frame?.size).not.toBe(p.size);
      const photo = await demoApi<{ w: number; h: number }>(`/photos/${p.photoId}`);
      expect(photo.h > photo.w).toBe(p.orientation === 'portrait');
    }
  });

  it('rejects all mutations without persisting visitor data', async () => {
    for (const init of [
      { method: 'POST', body: { name: 'test' } },
      { method: 'PUT', body: { title: 'changed' } },
      { method: 'PATCH', body: { title: 'changed' } },
      { method: 'DELETE' },
      { body: { title: 'implicit POST' } },
    ]) {
      await expect(demoApi('/photos/1', init)).rejects.toThrow('Read-only demo');
    }
    const photo = await demoApi<{ title: string }>('/photos/1');
    expect(photo.title).toBe('Mountain light');
  });

  it('has sample zines and a carousel that can be opened, edited, made and deleted in memory', async () => {
    type Z = { id: number; kind: string; name: string; stage: string; pages: { layout: string; photos: (number | null)[] }[]; candidates: number[]; printedCount: number; coverId: number | null };
    const list = await demoApi<Z[]>('/zines');
    expect(list.map(z => z.kind).sort()).toEqual(['carousel', 'zine', 'zine']);
    const zine = list.find(z => z.kind === 'zine' && z.stage === 'progress')!;
    expect((await demoApi<Z>(`/zines/${zine.id}`)).printedCount).toBe(8);
    const renamed = await demoApi<Z>(`/zines/${zine.id}`, { method: 'PUT', body: { name: 'Renamed', addCandidates: [1] } });
    expect(renamed.name).toBe('Renamed');
    expect(renamed.candidates).toContain(1);
    // The server's rules the editor relies on: a one-sheet zine has 8 pages, and Done is read-only.
    await expect(demoApi(`/zines/${zine.id}`, { method: 'PUT', body: { pages: Array.from({ length: 9 }, () => ({ layout: 'one', photos: [1] })) } })).rejects.toThrow('more than 8 pages');
    const done = list.find(z => z.stage === 'done')!;
    await expect(demoApi(`/zines/${done.id}`, { method: 'PUT', body: { name: 'x' } })).rejects.toThrow('is done');
    const made = await demoApi<Z>('/zines', { body: { kind: 'carousel', photoIds: [3, 4, 3] } });
    expect(made).toMatchObject({ kind: 'carousel', name: 'Untitled carousel', candidates: [3, 4], coverId: 3 });
    expect(made.pages).toHaveLength(2);
    expect((await demoApi<Z[]>('/zines')).some(z => z.id === made.id)).toBe(true);
    await demoApi(`/zines/${made.id}`, { method: 'DELETE' });
    expect((await demoApi<Z[]>('/zines')).some(z => z.id === made.id)).toBe(false);
  });

  it("lists the demo's own release first in What's new, and only that release when GitHub is unreachable", async () => {
    vi.stubEnv('VITE_DEMO_VERSION', 'v1.4.0');
    vi.resetModules();
    const { demoReleases, demoApi: api } = await import('./api');
    const rel = (tag: string, body: string) => ({ tag_name: tag, name: tag, published_at: '2026-11-01T00:00:00Z', html_url: `https://github.com/x/releases/tag/${tag}`, body });
    const gh = (async () => new Response(JSON.stringify([rel('v1.5.0', '- newer'), rel('v1.4.0', '- Framed demo\n- Other'), rel('v1.3.0', '- older')]))) as typeof fetch;
    const ok = await demoReleases(gh);
    expect(ok.current).toBe('1.4.0');
    expect(ok.all.map(r => r.name)).toEqual(['v1.4.0', 'v1.3.0']);
    expect(ok.all[0].items).toEqual(['Framed demo', 'Other']);
    const offline = await demoReleases((async () => { throw new Error('offline'); }) as typeof fetch);
    expect(offline.all.map(r => r.name)).toEqual(['v1.4.0']);
    expect((await api<{ version: string }>('/health')).version).toBe('1.4.0');
    vi.unstubAllEnvs();
  });
});
