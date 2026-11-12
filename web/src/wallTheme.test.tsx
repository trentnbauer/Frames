import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logic } from './proto/ProtoEditor.logic';
import { WallButton } from './components/WallButton';

describe('composition wall controls', () => {
  it('keeps black mat material independent of the app theme', () => {
    expect(new Logic().MAT.Black).not.toContain('var(');
  });
  it('uses theme colours for both the button surface and its text', () => {
    const html = renderToStaticMarkup(<WallButton>Room photo</WallButton>);
    expect(html).toContain('background:var(--wall-control-bg)');
    expect(html).toContain('color:var(--text)');
    expect(html).not.toContain('rgba(13,13,13');
  });
});
