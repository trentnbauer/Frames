import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowsePage } from './components/BrowsePage';
const prefs = vi.hoisted(() => ({ wide: false, set: vi.fn(), right: null as any }));
vi.mock('./settings/hooks', () => ({ usePrefs: () => ({ get: () => prefs.wide, set: prefs.set }) }));
vi.mock('./components/Shell', () => ({ Header: ({ right }: any) => { prefs.right = right; return <header>{right}</header>; } }));

describe('shared library and photoshoot width', () => {
  it('uses the saved preference and offers a toggle back to comfortable width', () => {
    prefs.wide = true;
    const markup = renderToStaticMarkup(<BrowsePage><main>Photos</main></BrowsePage>);
    expect(markup).toContain('browse-wide'); expect(markup).toContain('aria-pressed="true"');
    prefs.right.props.onClick(); expect(prefs.set).toHaveBeenLastCalledWith('browseFullWidth', false);
  });
  it('defaults to comfortable width and saves full width when toggled', () => {
    prefs.wide = false;
    const markup = renderToStaticMarkup(<BrowsePage><main>Photos</main></BrowsePage>);
    expect(markup).not.toContain('browse-wide'); expect(markup).toContain('aria-pressed="false"');
    prefs.right.props.onClick(); expect(prefs.set).toHaveBeenLastCalledWith('browseFullWidth', true);
  });
});
