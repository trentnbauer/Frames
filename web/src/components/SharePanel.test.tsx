import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharePanel } from './SharePanel';

const data = vi.hoisted(() => ({ links: [] as object[] | null, error: null as string | null }));
vi.mock('../api', () => ({
  api: vi.fn(),
  useApi: (path: string | null) => ({ data: path?.startsWith('/shares?') ? data.links : { invites: [], canEmail: false }, error: data.error, reload: vi.fn() }),
}));
afterEach(() => { vi.unstubAllGlobals(); data.links = []; data.error = null; });

describe('the shared photoshoot and composition dialog', () => {
  it('shows the same permission, expiry, name and PIN controls before creating a link', () => {
    for (const kind of ['shoot', 'collection'] as const) {
      const html = renderToStaticMarkup(<SharePanel kind={kind} id={1} name="Neon Interiors" onClose={() => {}} />);
      expect(html).toContain('Share Neon Interiors');
      for (const label of ['Rate photos', 'Download files', 'Link expires', 'Ask for their name', 'PIN', 'Create link']) expect(html).toContain(label);
      expect(html.includes('Suggest changes')).toBe(kind === 'collection');
      expect(html.includes('Only the wall')).toBe(kind === 'collection');
      expect(html).not.toContain('Share Kitchen');
    }
  });
  it('keeps active link actions and never-expiring settings', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [{ id: 2, token: 'test-link', status: 'active', expiresAt: null, pin: '', askName: true, allowReview: true }];
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} name="Coastal Light" onClose={() => {}} />);
    for (const label of ['Share Coastal Light', 'Copy link', 'New link', 'Stop sharing', 'Preview as guest', 'Never expires', 'Done']) expect(html).toContain(label);
    expect(html).not.toContain('Create link');
    expect(html.indexOf('Guests can')).toBeLessThan(html.indexOf('Copy link'));
  });
  it('disables creation while loading or when the existing links cannot be fetched', () => {
    data.links = null; data.error = 'Could not load links';
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} onClose={() => {}} />);
    expect(html).toContain('Could not load links');
    expect(html).toMatch(/disabled="">Create link/);
    expect(html).not.toContain('Guests can');
  });
});
