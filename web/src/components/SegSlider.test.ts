import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the sliding highlight', () => {
  it('never sets a position on the controls it slides in, so the fixed nav bar stays fixed', () => {
    const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]*has-seg-slider[^{}]*)\{([^}]*)\}/g)].filter(([, sel]) => /\.has-seg-slider\s*(,|$)/.test(sel.trim()));
    for (const [, sel, body] of rules) expect(body, sel).not.toMatch(/position\s*:/);
  });
});
