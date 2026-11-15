import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WishlistRows, wishBody, wishDraft } from './components/WishlistRows';
const item = { id: 4, name: 'Lens', type: 'lens', link: 'https://listing.example/item', price: null, why: 'Portraits' };
it('preserves missing prices and decimal amounts when starting an edit', () => { expect(wishDraft(item, 0)).toMatchObject({ price: '', priority: 1, link: item.link }); expect(wishDraft({ ...item, price: 420.25 }, 2).price).toBe('420.25'); });
it('validates edited names, prices and links without changing missing prices to zero', () => {
  expect(wishBody({ ...wishDraft(item, 0), price: '' }).price).toBeNull();
  expect(wishBody({ ...wishDraft(item, 0), price: '0' }).price).toBe(0);
  for (const price of ['invalid', '-1', 'Infinity']) expect(() => wishBody({ ...wishDraft(item, 0), price })).toThrow();
  for (const link of ['javascript:alert(1)', 'not a URL']) expect(() => wishBody({ ...wishDraft(item, 0), link })).toThrow();
  expect(() => wishBody({ ...wishDraft(item, 0), name: ' ' })).toThrow();
});
it('renders explicit editing, priority, listing and purchase controls for every item', () => {
  const html = renderToStaticMarkup(<WishlistRows items={[item, { ...item, id: 5, name: 'Body', price: 1.25 }]} currency="€" showWant={false} onChanged={async () => {}} onBought={() => {}} />);
  for (const text of ['Edit Lens', 'Edit Body', 'Move Lens down', 'Move Body up', 'Bought it', 'Price not set', '€1.25', 'noopener noreferrer']) expect(html).toContain(text);
});
