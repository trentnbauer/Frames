import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { isUntitled } from './desktop/LibraryPage';
import { DeleteShootDialog } from './desktop/parts';
import { buildTasks } from './todoTasks';
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
  it('asks whether to keep or delete a shoot’s photographs', () => {
    const html = renderToStaticMarkup(<DeleteShootDialog title="Delete “Coast”?" count={3} onKeep={() => undefined} onDelete={() => undefined} onClose={() => undefined} />);
    for (const text of ['Delete “Coast”?', '3 photographs', 'Delete shoot', 'Delete shoot & photos', 'Cancel']) expect(html).toContain(text);
  });
  it('lists photographs in no shoot as a task of their own, not one card per photograph', () => {
    const t = buildTasks([{ key: 'orphaned', count: 4, ids: [1, 2, 3, 4] }, { key: 'tags', count: 1, ids: [1] }]);
    expect(t.rows.find((r) => r.key === 'orphaned')?.n).toBe(4);
    expect(t.byPhoto.get(1)).toEqual(['tags']); // the photograph is not also queued under "orphaned"
  });
});
