import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MobileCompositions } from './mobile/Compositions';

const at = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><MobileCompositions /></MemoryRouter>);

describe('phone Compositions', () => {
  it('shows search, Frames / Zines / Carousels, the stage and the order, from the address', () => {
    const html = at('/collections?kind=zines&stage=done&sort=created&dir=asc&find=summer');
    expect(html).toContain('placeholder="Find a composition"');
    expect(html).toContain('value="summer"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Zines/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Done/);
    expect(html).toMatch(/<option value="created-asc" selected="">Created · oldest first<\/option>/);
    expect(html).toContain('0 zines done');
  });
  it('opens on Frames in progress, newest first, with no All stage', () => {
    const html = at('/collections');
    expect(html).toMatch(/aria-selected="true"[^>]*>Frames/);
    expect(html).toContain('0 compositions in progress');
    expect(html).not.toContain('>All<');
  });
});
