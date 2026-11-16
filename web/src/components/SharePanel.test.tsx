import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharePanel } from './SharePanel';

const data = vi.hoisted(() => ({ links: [] as object[] | null, error: null as string | null }));
vi.mock('../api', () => ({
  api: vi.fn(),
  useApi: (path: string | null) => ({ data: path?.startsWith('/shares?') ? data.links : { invites: [], canEmail: false }, error: data.error, reload: vi.fn() }),
}));
afterEach(() => { vi.unstubAllGlobals(); data.links = []; data.error = null; });

describe('the share window for a photoshoot or composition', () => {
  it('starts with the links list and a way to make the first link, and shows no settings until there is a link', () => {
    for (const kind of ['shoot', 'collection'] as const) {
      const html = renderToStaticMarkup(<SharePanel kind={kind} id={1} name="Neon Interiors" onClose={() => {}} />);
      expect(html).toContain('Share “Neon Interiors”');
      for (const text of ['LINKS', '+ New link', 'No links yet', 'Done']) expect(html).toContain(text);
      expect(html).not.toContain('Guests can rate');
    }
  });
  it('shows the selected link’s settings: copy, the permission switches, expiry, invitations and More options', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [{ id: 2, token: 'test-link', status: 'active', expiresAt: null, pin: '', askName: true, allowReview: true }];
    for (const kind of ['shoot', 'collection'] as const) {
      const html = renderToStaticMarkup(<SharePanel kind={kind} id={1} name="Coastal Light" onClose={() => {}} />);
      for (const text of ['Share “Coastal Light”', 'Copy', 'Guests can rate', 'Allow downloads', 'Require a PIN', 'Expires', 'Never', 'Invitations', 'More options', 'Done']) expect(html).toContain(text);
      expect(html.includes('Guests can suggest photos')).toBe(kind === 'collection');
      expect(html).not.toContain('Ask for their name'); // under More options until opened
    }
  });
  it('lists every link with its own name and status, including stopped and expired ones', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [
      { id: 3, label: 'Print studio', token: 'print', status: 'active', expiresAt: null, pin: '', allowDownload: true },
      { id: 2, label: 'Client review', token: 'client', status: 'revoked', expiresAt: null, pin: '', allowReview: true },
      { id: 1, label: 'Family', token: 'family', status: 'expired', expiresAt: null, pin: '' },
    ];
    const html = renderToStaticMarkup(<SharePanel kind="collection" id={1} onClose={() => {}} />);
    for (const text of ['Print studio', 'Client review', 'Family', 'Stopped', 'Expired', 'never expires']) expect(html).toContain(text);
  });
  it('says plainly that a stopped link is stopped and keeps its address from being opened', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    data.links = [{ id: 4, label: 'Old link', token: 'old', status: 'revoked', expiresAt: null, pin: '' }];
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} onClose={() => {}} />);
    expect(html).toContain('This link is stopped');
    expect(html).not.toContain('href="https://example.test/s/old"');
  });
  it('shows the error instead of the links when they cannot be fetched', () => {
    data.links = null; data.error = 'Could not load links';
    const html = renderToStaticMarkup(<SharePanel kind="shoot" id={1} onClose={() => {}} />);
    expect(html).toContain('Could not load links');
    expect(html).not.toContain('+ New link');
  });
});
