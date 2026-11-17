import { describe, expect, it } from 'vitest';

describe('the sliding highlight', () => {
  it('never sets a position on the controls it slides in, so the fixed nav bar stays fixed', async () => {
    // Read from disk: Vitest hands CSS imports to tests as empty text. (The web app has no Node types, hence the untyped import.)
    const { readFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync: (p: URL, enc: string) => string };
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toContain('has-seg-slider');
    const rules = [...css.matchAll(/([^{}]*has-seg-slider[^{}]*)\{([^}]*)\}/g)].filter(([, sel]) => /\.has-seg-slider\s*(,|$)/.test(sel.trim()));
    for (const [, sel, body] of rules) expect(body, sel).not.toMatch(/position\s*:/);
  });
});
