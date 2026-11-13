import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProtoGear from './proto/ProtoGear';
import { GearBlacklist } from './components/GearBlacklist';

it('renders blacklist tags with individual removal actions and an entry field', () => {
  const html = renderToStaticMarkup(<GearBlacklist items={[{ id: 1, name: 'Scanner & lens', types: ['camera', 'lens'] }]} onChanged={() => {}} />);
  expect(html).toContain('aria-label="Blacklisted gear"');
  expect(html).toContain('aria-label="Add blacklisted gear"');
  expect(html).toContain('aria-label="Remove Scanner &amp; lens from blacklist"');
  expect(html).toContain('Scanner &amp; lens');
});

it('keeps discovered gear and photo counts above owned blocks, with the blacklist underneath', () => {
  const html = renderToStaticMarkup(<ProtoGear
    items={[{ id: 1, name: 'Owned camera', type: 'Body', system: 'Atlas', serial: '', used: 2 }]}
    wish={[]} found={[{ name: 'Discovered lens', type: 'lens', n: '7 photos' }]} onBlocklistFound={() => {}}
    blacklistControl={<GearBlacklist items={[{ id: 2, name: 'Blocked scanner', types: ['camera'] }]} onChanged={() => {}} />}
  />);
  expect(html).toContain('Found in your photos');
  expect(html).toContain('Discovered lens');
  expect(html).toContain('7 photos');
  expect(html).toContain('aria-label="Blocklist Discovered lens"');
  expect(html).toContain('aria-label="Add Discovered lens to gear"');
  expect(html.indexOf('Discovered lens')).toBeLessThan(html.indexOf('Owned camera'));
  expect(html.indexOf('Owned camera')).toBeLessThan(html.indexOf('aria-label="Blacklisted gear"'));
  expect(html).toContain('Blocked scanner');
});

it('keeps the discovered strip visible when there are no suggestions', () => {
  const html = renderToStaticMarkup(<ProtoGear items={[]} wish={[]} found={[]} />);
  expect(html).toContain('Found in your photos');
  expect(html).toContain('No new gear found in your photos.');
});
