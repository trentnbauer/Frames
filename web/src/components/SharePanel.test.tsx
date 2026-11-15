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
      expect(html.includes('Shared arrangement')).toBe(kind === 'collection');
      expect(html.includes('Live editor')).toBe(kind === 'collection');
      expect(html).not.toContain('Share Kitchen');
    }
  });
  it('keeps active link actions and never-expiring settings', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [{ id: 2, token: 'test-link', status: 'active', expiresAt: null, pin: '', askName: true, allowReview: true }];
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} name="Coastal Light" onClose={() => {}} />);
    for (const label of ['Share Coastal Light', 'Copy link', 'New link', 'Stop this link', 'Preview as guest', 'Never expires', 'Done']) expect(html).toContain(label);
    expect(html).not.toContain('Create link');
    expect(html.indexOf('Guests can')).toBeLessThan(html.indexOf('Copy link'));
  });
  it('lists all links with independent labels and status, including inactive links', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [
      { id: 3, label: 'Print studio', token: 'print', status: 'active', expiresAt: null, pin: '', allowDownload: true },
      { id: 2, label: 'Client review', token: 'client', status: 'revoked', expiresAt: null, pin: '', allowReview: true },
      { id: 1, label: 'Family', token: 'family', status: 'expired', expiresAt: null, pin: '' },
    ];
    const html = renderToStaticMarkup(<SharePanel kind="collection" id={1} onClose={() => {}} />);
    for (const label of ['Print studio', 'Client review', 'Family', 'Stopped', 'Expired', '+ New link', 'Link name', 'Replace address']) expect(html).toContain(label);
    expect(html).toContain('aria-label="Share links"');
    expect(html).toContain('Only the selected link is changed.');
  });
  it('keeps inactive links selectable and offers explicit reactivation', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [{ id: 4, label: 'Old link', token: 'old', status: 'revoked', expiresAt: null, pin: '' }];
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} onClose={() => {}} />);
    expect(html).toContain('Reactivate this link');
    expect(html).not.toContain('href="https://example.test/s/old"');
  });
  it('disables creation while loading or when the existing links cannot be fetched', () => {
    data.links = null; data.error = 'Could not load links';
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} onClose={() => {}} />);
    expect(html).toContain('Could not load links');
    expect(html).not.toContain('Create link');
    expect(html).not.toContain('Guests can');
  });
});
