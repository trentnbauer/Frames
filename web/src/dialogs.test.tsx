import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShootActions } from './components/ShootActions';
it('keeps browser-native confirmation and input prompts out of the app', () => {
  const sources = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  for (const [file, source] of Object.entries(sources)) {
    if (!file.includes('.test.')) expect(source, file).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  }
});
it('provides an accessible closed shoot menu', () => {
  const html = renderToStaticMarkup(<ShootActions name="Test shoot" count={2} aiOn onAnalyse={async () => ''} onDelete={async () => {}} />);
  expect(html).toContain('aria-label="Shoot actions"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('Delete entire shoot');
});
