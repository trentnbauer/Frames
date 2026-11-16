import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { isUntitled } from './desktop/LibraryPage';
import { ShareShoot } from './pages/ShareShoot';
import { TAB_PATHS } from './mobile/Chrome';
import type { Shoot } from './data';

vi.mock('./store', () => ({ useStore: () => ({ summary: { due: 3 }, todoItems: [], refreshSummary: () => undefined }) }));

describe('the redesigned screens', () => {
  it('knows a shoot nobody has named: empty, or just its date', () => {
    const shoot = (name: string) => ({ name }) as Shoot;
    expect(isUntitled(shoot(''))).toBe(true);
    expect(isUntitled(shoot('5 Nov 2026'))).toBe(true);
    expect(isUntitled(shoot('Blue Mountains'))).toBe(false);
  });
  it('puts Library, a shoot and a photograph under one Library tab on a phone', () => {
    expect(TAB_PATHS['/library']).toBe('library');
    expect(TAB_PATHS['/shoots']).toBe('library');
    expect(TAB_PATHS['/reviews']).toBe('review');
    expect(TAB_PATHS['/photo/1']).toBeUndefined(); // a photograph is a page above the tab bar
  });
  it('shows a shared photoshoot with a download card, filters and a send bar when guests may rate and download', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><ShareShoot token="t" reviewer="" setName={() => undefined} withName={() => undefined} dl={null} download={() => undefined} cancelDl={() => undefined}
        d={{ name: 'Coastal Light', description: '', allowReview: true, allowDownload: true, expiresAt: null, owner: 'Trent' }}
        photos={[{ id: 1, title: 'One', ar: 1.5, n: 1 }, { id: 2, title: 'Two', ar: 0.8, n: 2 }]} /></MemoryRouter>,
    );
    for (const text of ['A PHOTOSHOOT · 2 PHOTOGRAPHS', 'Coastal Light', 'Download all 2', 'To rate', '0 of 2 rated', 'Send to Trent', 'This link doesn’t expire']) expect(html).toContain(text);
  });
  it('leaves out ratings and downloads on a view-only link', () => {
    const html = renderToStaticMarkup(
      <ShareShoot token="t" reviewer="" setName={() => undefined} withName={() => undefined} dl={null} download={() => undefined} cancelDl={() => undefined}
        d={{ name: 'Coastal Light', description: '', allowReview: false, allowDownload: false, expiresAt: null }} photos={[{ id: 1, title: 'One', ar: 1.5, n: 1 }]} />,
    );
    expect(html).toContain('All photographs');
    for (const text of ['To rate', 'Download all', 'Send to']) expect(html).not.toContain(text);
  });
});
