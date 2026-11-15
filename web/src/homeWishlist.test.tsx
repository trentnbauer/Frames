import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { WishlistStrip, type WishlistData } from './components/HomeWishlist';
const data: WishlistData = { want: [{ id: 1, name: 'Rokkor 85mm', type: 'lens', system: 'Minolta SR', why: '', price: 420 }, { id: 2, name: 'Leica M6', type: 'camera', system: '', why: 'Everyday photos', price: null }, { id: 3, name: 'Meter', type: 'light', system: '', why: '', price: 180 }], own: [{ system: 'Minolta SR' }], prefs: { currency: '€' } };
const render = (value: WishlistData | null) => renderToStaticMarkup(<MemoryRouter><WishlistStrip data={value} /></MemoryRouter>);
it('hides an empty or unloaded wishlist', () => { expect(render(null)).toBe(''); expect(render({ ...data, want: [] })).toBe(''); });
it('shows the first two priority items, the full count and owned-system compatibility', () => { const html = render(data); expect(html).toContain('Rokkor 85mm'); expect(html).toContain('Leica M6'); expect(html).not.toContain('Meter'); expect(html).toContain('All 3 items'); expect(html).toContain('Fits Minolta SR'); expect(html).toContain('href="/gear"'); });
it('uses the chosen currency, distinguishes unknown prices from zero, and handles a single item', () => { expect(render(data)).toContain('€420'); expect(render(data)).toContain('Price not set'); const html = render({ ...data, want: [{ ...data.want[0], price: 0 }] }); expect(html).toContain('€0'); expect(html).toContain('All 1 item'); });
