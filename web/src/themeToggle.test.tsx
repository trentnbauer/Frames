import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ThemeToggle } from './components/ThemeToggle';

it('exposes the theme action and uses the same icon dimensions and stroke as the bell', () => {
  const html = renderToStaticMarkup(<ThemeToggle />);
  expect(html).toContain('aria-label="Switch to light mode"');
  expect(html).toContain('class="iconbtn"');
  expect(html).toContain('width="16" height="16"');
  expect(html).toContain('stroke-width="1.4"');
  expect(html).toContain('aria-hidden="true"');
});
