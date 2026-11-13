import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GroupView, type Group } from './settings/ui';

it('renders settings cards and controls with theme colours, including an open select menu', () => {
  const group: Group = { title: 'Display', rows: [
    { id: 'name', t: 'text', label: 'Name', value: 'Frames' },
    { id: 'width', t: 'toggle', label: 'Full width', value: true },
    { id: 'theme', t: 'seg', label: 'Theme', value: 'Light', opts: ['Dark', 'Light'] },
    { id: 'start', t: 'select', label: 'Open on', value: 'Home', opts: ['Home', 'Library'] },
  ] };
  const html = renderToStaticMarkup(<GroupView g={group} vis={() => true} open="start" setOpen={() => {}} />);
  expect(html).toContain('role="listbox"');
  expect(html).toContain('background:var(--surface)');
  expect(html).toContain('background:var(--raised2)');
  expect(html).toContain('color:var(--text)');
  expect(html).toContain('color:var(--bg)');
  expect(html).toContain('var(--outline)');
  expect(html).not.toMatch(/#(?:efede8|0d0d0d|161615|a8a59f)|rgba\(255,255,255/);
});
