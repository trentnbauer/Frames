import { describe, expect, it } from 'vitest';
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
});
