import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowsePage } from './components/BrowsePage';
import { LayoutPreferencesProvider, useLayoutPreferences } from './layoutPreferences';
const prefs = vi.hoisted(() => ({ wide: false, set: vi.fn() }));
vi.mock('./settings/hooks', () => ({ usePrefs: () => ({ get: () => prefs.wide, set: prefs.set }) }));
let change: (wide: boolean) => void;
function Probe() { const layout = useLayoutPreferences(); change = layout.setFullWidth; return <BrowsePage><main>Photos</main></BrowsePage>; }

describe('app-wide layout preference', () => {
  it('keeps the existing saved width choice and applies it around the app', () => {
    prefs.wide = true;
    const markup = renderToStaticMarkup(<LayoutPreferencesProvider><Probe /></LayoutPreferencesProvider>);
    expect(markup).toContain('app-layout app-wide');
    expect(markup).not.toContain('browse-wide');
    expect(markup).not.toContain('<header');
    change(false); expect(prefs.set).toHaveBeenLastCalledWith('browseFullWidth', false);
  });
  it('uses comfortable width until the shared preference is changed', () => {
    prefs.wide = false;
    const markup = renderToStaticMarkup(<LayoutPreferencesProvider><Probe /></LayoutPreferencesProvider>);
    expect(markup).not.toContain('app-wide');
    change(true); expect(prefs.set).toHaveBeenLastCalledWith('browseFullWidth', true);
  });
});
