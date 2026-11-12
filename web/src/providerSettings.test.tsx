import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Access } from './pages/Access';
vi.mock('./api', () => ({ api: vi.fn(), useApi: (path: string) => ({ data: path === '/auth/config' ? { enabled: false, allow: [], providers: [], publicUrl: '', callbackBase: 'http://localhost', sessions: 0 } : null }) }));
vi.mock('./store', () => ({ useStore: () => ({ refreshMe: vi.fn(), me: null }) }));

describe('provider configuration modal', () => {
  it('shows only GitHub when opened for GitHub', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Access focus="github" /></MemoryRouter>);
    expect(html).toContain('GitHub');
    for (const unrelated of ['Google', 'Dropbox', 'Microsoft', 'Cloudflare Access', 'Who is allowed in', 'Sign everyone out', 'Require sign-in']) expect(html).not.toContain(unrelated);
  });
  it('keeps the complete management screen available when no provider is selected', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Access /></MemoryRouter>);
    expect(html).toContain('GitHub'); expect(html).toContain('Google'); expect(html).toContain('Who is allowed in');
  });
});
