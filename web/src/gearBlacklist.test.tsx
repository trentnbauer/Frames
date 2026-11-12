import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GearBlacklist } from './components/GearBlacklist';

it('renders blacklist tags with individual removal actions and an entry field', () => {
  const html = renderToStaticMarkup(<GearBlacklist items={[{ id: 1, name: 'Scanner & lens', types: ['camera', 'lens'] }]} onChanged={() => {}} />);
  expect(html).toContain('aria-label="Blacklisted gear"');
  expect(html).toContain('aria-label="Add blacklisted gear"');
  expect(html).toContain('aria-label="Remove Scanner &amp; lens from blacklist"');
  expect(html).toContain('Scanner &amp; lens');
});
